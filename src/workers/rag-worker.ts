/**
 * RAG Web Worker — Off-Main-Thread Vector DB + Embedding Pipeline
 *
 * This worker runs entirely off the main UI thread to prevent Monaco
 * editor stuttering during indexing and embedding generation.
 *
 * Architecture:
 *   1. Receives "bootstrap" → fetches corpus JSON, loads embedding model,
 *      generates vectors, indexes into Orama.
 *   2. Receives "search" → embeds query, runs Orama vector search,
 *      returns top-K results with timing metrics.
 *
 * Embedding Strategy:
 *   - Primary: @xenova/transformers with paraphrase-multilingual-MiniLM-L12-v2
 *   - Fallback: Deterministic hash-based pseudo-embeddings (if model fails to load)
 *   - Both produce 384-dim vectors compatible with Orama's vector search.
 */

import { create, insert, search } from "@orama/orama";
import type {
  WorkerRequest,
  WorkerResponse,
  CorpusEntry,
  RAGResult,
  RAGState,
} from "../lib/rag-types";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  MODEL_LOAD_TIMEOUT_MS,
  RAG_SEARCH_LIMIT,
} from "../lib/constants";

// ─── Worker State ────────────────────────────────────────────────
let db: ReturnType<typeof create> | null = null;
let embedder: any = null;
let embeddingMode: "real" | "fallback" = "fallback";
let currentState: RAGState = "idle";

// ─── Message Helpers ─────────────────────────────────────────────

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

function log(
  level: "info" | "warn" | "error",
  message: string
): void {
  post({ type: "log", level, message });
}

function setStatus(
  state: RAGState,
  message: string,
  extra?: { progress?: number; embeddingMode?: "real" | "fallback" }
): void {
  currentState = state;
  post({
    type: "status",
    state,
    message,
    embeddingMode,
    ...extra,
  });
}

// ─── Fallback Embedding Generator ─────────────────────────────────
// Deterministic hash-based pseudo-embeddings for when the Transformers.js
// model cannot be loaded (network issues, timeout, unsupported browser).
// NOT semantically meaningful — demonstrates the full pipeline only.

function generateFallbackEmbedding(text: string, dims: number): number[] {
  const vector = new Array(dims).fill(0);

  // Character-level: spread character codes across vector dimensions
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const pos = (code * 7 + i * 13) % dims;
    vector[pos] += Math.sin(code * 0.1 + i * 0.01) + 1;
  }

  // Word-level: hash-based features for better text sensitivity
  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    if (!word) continue;
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    const base = Math.abs(hash) % dims;
    const spread = Math.min(word.length * 3, dims);
    for (let i = 0; i < spread; i++) {
      const pos = (base + i) % dims;
      vector[pos] += Math.cos(hash * 0.01 + i * 0.1) + 1;
    }
  }

  // Normalize to unit vector
  const norm =
    Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

// ─── Embedding Generator (Dispatches to real or fallback) ────────

async function generateEmbedding(text: string): Promise<number[]> {
  if (embeddingMode === "real" && embedder) {
    try {
      const output = await embedder(text, {
        pooling: "mean",
        normalize: true,
      });
      // Transformers.js returns a Tensor; .data is Float32Array
      return Array.from(output.data as Float32Array);
    } catch (err) {
      log(
        "warn",
        `Real embedding generation failed, using fallback: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return generateFallbackEmbedding(text, EMBEDDING_DIMENSIONS);
    }
  }
  return generateFallbackEmbedding(text, EMBEDDING_DIMENSIONS);
}

// ─── Initialize Transformers.js Embedding Model ──────────────────

async function initEmbeddingModel(): Promise<boolean> {
  setStatus("loading-model", "Loading Transformers.js embedding model…");

  try {
    // Dynamic import — Transformers.js is NOT bundled upfront
    const { pipeline, env } = await import("@xenova/transformers");

    // Configure for browser/worker environment
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    log("info", `Loading model: ${EMBEDDING_MODEL_ID}`);

    // Race model loading against a timeout
    const modelPromise = pipeline(
      "feature-extraction",
      EMBEDDING_MODEL_ID,
      {
        progress_callback: (progress: {
          status: string;
          progress?: number;
          file?: string;
        }) => {
          if (progress.status === "progress" && progress.progress != null) {
            setStatus(
              "loading-model",
              `Downloading: ${progress.file ?? ""} ${Math.round(
                progress.progress
              )}%`,
              { progress: progress.progress }
            );
          } else {
            setStatus("loading-model", `Model ${progress.status}…`);
          }
        },
      }
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Model load timed out")),
        MODEL_LOAD_TIMEOUT_MS
      )
    );

    embedder = await Promise.race([modelPromise, timeoutPromise]) as any;
    embeddingMode = "real";

    log(
      "info",
      `Embedding model loaded: ${EMBEDDING_MODEL_ID} (${EMBEDDING_DIMENSIONS}d)`
    );
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("warn", `Transformers.js model failed to load: ${msg}`);
    log("info", "Switching to deterministic fallback embeddings");

    embeddingMode = "fallback";
    setStatus(
      "loading-model",
      "Using fallback embeddings (model unavailable)"
    );
    return false;
  }
}

// ─── Bootstrap: Fetch Corpus → Generate Embeddings → Index ───────

async function bootstrap(corpusUrl: string, preloadedData?: CorpusEntry[]): Promise<void> {
  try {
    let corpus: CorpusEntry[];

    if (preloadedData && preloadedData.length > 0) {
      // Use pre-loaded corpus from localStorage cache (skip HTTP fetch)
      corpus = preloadedData;
      setStatus("indexing", `Using cached corpus (${corpus.length} entries)…`);
      log("info", `Using pre-loaded corpus: ${corpus.length} entries`);
    } else {
      // Fetch corpus from URL
      setStatus("indexing", "Fetching corpus JSON…");
      const response = await fetch(corpusUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch corpus: ${response.status} ${response.statusText}`
        );
      }
      corpus = await response.json();
      log("info", `Corpus fetched: ${corpus.length} entries`);
    }

    // Attempt to load the real embedding model
    await initEmbeddingModel();

    // Create Orama in-memory vector database
    setStatus("indexing", "Creating Orama vector database…");
    db = create({
      schema: {
        id: "string",
        en: "string",
        ar: "string",
        context: "string",
        embedding: `vector[${EMBEDDING_DIMENSIONS}]`,
        type: "string",
        amta_enforcement: "boolean",
      },
    } as any); // Orama's create accepts this shape
    log("info", "Orama database created");

    // Generate embeddings and index each corpus entry
    for (let i = 0; i < corpus.length; i++) {
      const entry = corpus[i];
      const embedding = await generateEmbedding(entry.en);

      await insert(db as any, {
        id: entry.id,
        en: entry.en,
        ar: entry.ar,
        context: entry.context,
        embedding,
        // Preserve GTR metadata for search results
        type: entry.type || "terminology",
        amta_enforcement: entry.amta_enforcement || false,
      });

      setStatus(
        "indexing",
        `Indexing ${i + 1}/${corpus.length}: "${entry.en}"`,
        { progress: ((i + 1) / corpus.length) * 100 }
      );
    }

    log(
      "info",
      `Bootstrapped: ${corpus.length} entries indexed (${embeddingMode} embeddings)`
    );
    setStatus("ready", `GTR ready — ${corpus.length} entries indexed`);

    post({
      type: "bootstrap-complete",
      count: corpus.length,
      embeddingMode,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", `Bootstrap failed: ${msg}`);
    setStatus("error", `Bootstrap failed: ${msg}`);
  }
}

// ─── Search: Embed Query → Vector Search → Top-K Results ────────

async function searchQuery(
  query: string,
  requestId: string
): Promise<void> {
  if (!db) {
    post({
      type: "search-result",
      requestId,
      results: [],
      timing: { embedMs: 0, searchMs: 0, totalMs: 0 },
    });
    log("warn", "Search called but database is not initialized");
    return;
  }

  setStatus("searching", "Embedding query…");

  const totalStart = performance.now();

  // ── Step 1: Generate embedding for the query ──
  const embedStart = performance.now();
  const queryEmbedding = await generateEmbedding(query);
  const embedMs = performance.now() - embedStart;

  // ── Step 2: Vector search in Orama ──
  setStatus("searching", "Searching vector database…");
  const searchStart = performance.now();

  const results = await search(db as any, {
    vector: {
      value: queryEmbedding,
      property: "embedding",
      similarity: 0.2, // Lowered from 0.3 to allow more fuzzy semantic matches
    } as any, // Orama's TypeScript types are incomplete for vector search options
    limit: RAG_SEARCH_LIMIT,
  });

  const searchMs = performance.now() - searchStart;
  const totalMs = performance.now() - totalStart;

  // ── Step 3: Format results ──
  const ragResults: RAGResult[] = (results.hits || []).map(
    (hit: { id: string; score: number; document: any }) => ({
      id: hit.document.id,
      en: hit.document.en,
      ar: hit.document.ar,
      context: hit.document.context,
      score: hit.score,
      type: hit.document.type,
      amta_enforcement: hit.document.amta_enforcement,
    })
  );

  // ── Step 4: Log detailed results ──
  log(
    "info",
    `[RAG] Search: embed=${embedMs.toFixed(1)}ms | vectorSearch=${searchMs.toFixed(1)}ms | total=${totalMs.toFixed(1)}ms (${embeddingMode} embeddings)`
  );
  log("info", `[RAG] Top ${ragResults.length} semantic matches:`);
  ragResults.forEach((r, i) => {
    log(
      "info",
      `  ${i + 1}. "${r.en}" → "${r.ar}" (score: ${r.score.toFixed(4)})`
    );
  });

  // Verify sub-50ms target for vector search only
  if (searchMs <= 50) {
    log(
      "info",
      `[RAG] ✓ Vector search latency: ${searchMs.toFixed(1)}ms — WITHIN 50ms target`
    );
  } else {
    log(
      "warn",
      `[RAG] ⚠ Vector search latency: ${searchMs.toFixed(1)}ms — EXCEEDS 50ms target`
    );
  }

  post({
    type: "search-result",
    requestId,
    results: ragResults,
    timing: { embedMs, searchMs, totalMs },
  });

  setStatus(
    "ready",
    `GTR ready — last search: ${searchMs.toFixed(1)}ms (${embeddingMode})`
  );
}

// ─── Worker Message Handler ──────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  switch (msg.type) {
    case "bootstrap":
      log("info", `Bootstrapping GTR pipeline from: ${msg.corpusUrl}${msg.corpusData ? " (pre-loaded cache)" : ""}`);
      bootstrap(msg.corpusUrl, msg.corpusData);
      break;

    case "search":
      searchQuery(msg.query, msg.requestId);
      break;

    case "get-status":
      post({
        type: "status",
        state: currentState,
        message: `Current state: ${currentState}`,
        embeddingMode,
      });
      break;

    default:
      log("warn", `Unknown worker message type: ${(msg as any).type}`);
  }
};

// Signal that the worker is alive
setStatus("idle", "RAG Worker initialized — awaiting bootstrap command");
