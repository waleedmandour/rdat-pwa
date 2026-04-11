/**
 * RAG Worker — Web Worker for vector embedding + semantic search.
 *
 * Handles:
 *  - INIT: Initialize Orama DB + Transformers.js pipeline
 *  - INGEST_CORPUS: Embed and store bilingual sentence pairs
 *  - SEARCH: Semantic similarity search returning top-k matches
 *
 * Runs entirely off the main thread — zero UI blocking.
 */

import { create, insertMultiple, search as oramaSearch, type AnyOrama } from "@orama/orama";

// Lazy-loaded embedding pipeline (Transformers.js)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embeddingPipeline: any = null;
let db: AnyOrama | null = null;
let isInitialized = false;

// Corpus entry type
interface CorpusEntry {
  en: string;
  ar: string;
  type: string;
  index: number;
}

// Message types
type WorkerMessage =
  | { type: "INIT"; payload: { model?: string } }
  | { type: "INGEST_CORPUS"; payload: { entries: Array<{ en: string; ar: string; type: string }> } }
  | { type: "SEARCH"; payload: { query: string; limit?: number } };

/**
 * Initialize the embedding pipeline.
 * Uses Xenova/all-MiniLM-L6-v2 — a lightweight 22.7M parameter model
 * optimized for sentence similarity (384-dim embeddings).
 */
async function initPipeline(model = "Xenova/all-MiniLM-L6-v2") {
  if (isInitialized) return;

  try {
    // @ts-ignore — dynamic import in worker context
    const { pipeline, env } = await import("@xenova/transformers");

    // Force browser mode — no local filesystem access
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    // Initialize the feature-extraction pipeline
    pipeline("feature-extraction", model, {
      // Quantized model for faster browser loading
      quantized: true,
    }).then((p: any) => {
      embeddingPipeline = p;
      isInitialized = true;
      self.postMessage({ type: "INIT_COMPLETE", payload: { model, status: "ready" } });
    }).catch((err: Error) => {
      self.postMessage({ type: "INIT_ERROR", payload: { error: err.message } });
    });
  } catch (err: any) {
    self.postMessage({
      type: "INIT_ERROR",
      payload: { error: `Failed to load Transformers.js: ${err.message}` },
    });
  }
}

/**
 * Generate embeddings for a text string.
 * Returns a number[] (384-dim for all-MiniLM-L6-v2).
 */
async function embed(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    // Fallback: return a simple hash-based embedding if model not loaded
    return simpleHashEmbedding(text);
  }

  const output = await embeddingPipeline(text, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data) as number[];
}

/**
 * Simple fallback embedding — character n-gram hash vector.
 * Used when the ML model hasn't loaded yet. Produces 128-dim vectors.
 * Not as accurate as ML embeddings but fast and deterministic.
 */
function simpleHashEmbedding(text: string): number[] {
  const dims = 128;
  const vector = new Float32Array(dims);
  const normalized = text.toLowerCase().trim();

  // Character trigram hashing
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.substring(i, i + 3);
    let hash = 5381;
    for (let j = 0; j < trigram.length; j++) {
      hash = ((hash << 5) + hash) + trigram.charCodeAt(j);
      hash = hash & hash; // Convert to 32-bit int
    }
    const idx = Math.abs(hash) % dims;
    vector[idx] += 1;
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i++) vector[i] /= norm;

  return Array.from(vector);
}

/**
 * Initialize the Orama in-memory database.
 */
async function initDB() {
  if (db) return;

  db = await create({
    schema: {
      en: "string",
      ar: "string",
      type: "string",
      index: "number",
      embedding: "vector" as any, // Orama vector type
    },
  });
}

/**
 * Ingest corpus entries into Orama DB.
 */
async function ingestCorpus(entries: Array<{ en: string; ar: string; type: string }>) {
  if (!db) await initDB();

  const corpusEntries: CorpusEntry[] = entries.map((entry, index) => ({
    en: entry.en,
    ar: entry.ar,
    type: entry.type,
    index,
  }));

  // Generate embeddings for each entry (fallback if model not ready)
  const docs = await Promise.all(
    corpusEntries.map(async (entry) => {
      const embedding = await embed(entry.en);
      return {
        en: entry.en,
        ar: entry.ar,
        type: entry.type,
        index: entry.index,
        embedding,
      };
    })
  );

  const inserted = await insertMultiple(db!, docs);

  self.postMessage({
    type: "INGEST_COMPLETE",
    payload: { count: inserted.length, total: entries.length },
  });
}

/**
 * Semantic search — find top-k most similar English sentences.
 */
async function search(query: string, limit = 3) {
  if (!db) {
    self.postMessage({
      type: "SEARCH_ERROR",
      payload: { error: "Database not initialized. Call INGEST_CORPUS first." },
    });
    return;
  }

  const queryEmbedding = await embed(query);

  try {
    // Orama vector similarity search
    const results = await oramaSearch(db!, {
      mode: "vector" as any,
      vector: {
        value: queryEmbedding,
        property: "embedding",
      },
      limit,
    });

    const hits = results.hits.map((hit: any) => ({
      score: hit.score,
      en: hit.document.en,
      ar: hit.document.ar,
      type: hit.document.type,
      index: hit.document.index,
    }));

    self.postMessage({
      type: "SEARCH_RESULTS",
      payload: { query, hits },
    });
  } catch (err: any) {
    self.postMessage({
      type: "SEARCH_ERROR",
      payload: { error: err.message },
    });
  }
}

// ── Message Handler ──────────────────────────────────────────

self.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;

  switch (type) {
    case "INIT":
      await initPipeline(payload?.model);
      break;

    case "INGEST_CORPUS":
      await ingestCorpus(payload.entries);
      break;

    case "SEARCH":
      await search(payload.query, payload.limit ?? 3);
      break;

    default:
      self.postMessage({
        type: "UNKNOWN_MESSAGE",
        payload: { type },
      });
  }
});

// Signal worker is ready
self.postMessage({ type: "WORKER_READY" });
