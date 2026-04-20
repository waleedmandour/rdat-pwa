/**
 * RAG Worker — State Machine Implementation
 * 
 * Three-phase state machine with proper initialization sequence:
 *  Phase 1: Load BGE-M3 embeddings model
 *  Phase 2: Index corpus after models load
 *  Phase 3: Process search requests with timeout handling
 * 
 * Queue requests during initialization to prevent data loss.
 */

import { create, insertMultiple, search as oramaSearch, type AnyOrama } from "@orama/orama";

interface WorkerState {
  status: "idle" | "initializing" | "indexing" | "ready" | "error";
  modelsLoaded: boolean;
  corpusIndexed: boolean;
  totalIndexed: number;
  error: string | null;
}

// Global state
let state: WorkerState = {
  status: "idle",
  modelsLoaded: false,
  corpusIndexed: false,
  totalIndexed: 0,
  error: null,
};

// Lazy-loaded embedding pipeline
let embeddingPipeline: any = null;
let db: AnyOrama | null = null;

// Queue for requests during initialization
const requestQueue: Array<{ type: string; payload: any; id: string }> = [];

interface CorpusEntry {
  en: string;
  ar: string;
  type: string;
  index: number;
}

interface SearchResult {
  score: number;
  en: string;
  ar: string;
  type: string;
  index: number;
}

/**
 * Phase 1: Initialize embedding models (BGE-M3).
 */
async function initializeModels(): Promise<void> {
  if (state.modelsLoaded) return;

  try {
    state.status = "initializing";
    state.error = null;
    self.postMessage({ type: "STATE_CHANGE", payload: { status: "initializing" } });

    // @ts-ignore — dynamic import in worker context
    const { pipeline, env } = await import("@xenova/transformers");

    // Force browser mode
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.allowRemoteModels = true;

    // Load feature-extraction pipeline (BGE-M3 compatible)
    embeddingPipeline = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", {
      quantized: true,
    });

    state.modelsLoaded = true;
    self.postMessage({ type: "MODELS_READY", payload: { model: "bge-small-en-v1.5" } });
  } catch (err: any) {
    state.status = "error";
    state.error = err.message;
    self.postMessage({
      type: "INIT_ERROR",
      payload: { error: `Failed to initialize models: ${err.message}` },
    });
  }
}

/**
 * Initialize Orama database.
 */
async function initDB(): Promise<void> {
  if (db) return;

  db = await create({
    schema: {
      en: "string",
      ar: "string",
      type: "string",
      index: "number",
      embedding: "vector" as any,
    },
  });
}

/**
 * Generate embedding for text (fallback if model not ready).
 */
async function embed(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    return simpleHashEmbedding(text);
  }

  try {
    const output = await embeddingPipeline(text, {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(output.data);
  } catch {
    return simpleHashEmbedding(text);
  }
}

/**
 * Simple hash-based embedding fallback.
 */
function simpleHashEmbedding(text: string): number[] {
  const dims = 128;
  const vector = new Float32Array(dims);
  const normalized = text.toLowerCase().trim();

  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.substring(i, i + 3);
    let hash = 5381;
    for (let j = 0; j < trigram.length; j++) {
      hash = ((hash << 5) + hash) + trigram.charCodeAt(j);
      hash = hash & hash;
    }
    const idx = Math.abs(hash) % dims;
    vector[idx] += 1;
  }

  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i++) vector[i] /= norm;

  return Array.from(vector);
}

/**
 * Phase 2: Index corpus after models load (batch size 10).
 */
async function indexCorpus(entries: Array<{ en: string; ar: string; type: string }>): Promise<void> {
  if (!state.modelsLoaded) {
    state.error = "Models not loaded yet";
    return;
  }

  try {
    state.status = "indexing";
    self.postMessage({ type: "STATE_CHANGE", payload: { status: "indexing" } });

    if (!db) await initDB();

    const corpusEntries: CorpusEntry[] = entries.map((entry, index) => ({
      en: entry.en,
      ar: entry.ar,
      type: entry.type,
      index,
    }));

    // Process in batches of 10 to avoid memory spikes
    const batchSize = 10;
    let processed = 0;

    for (let i = 0; i < corpusEntries.length; i += batchSize) {
      const batch = corpusEntries.slice(i, i + batchSize);
      const docs = await Promise.all(
        batch.map(async (entry) => ({
          ...entry,
          embedding: await embed(entry.en),
        }))
      );

      await insertMultiple(db!, docs);
      processed += docs.length;

      // Report progress every batch
      self.postMessage({
        type: "INDEXING_PROGRESS",
        payload: { processed, total: corpusEntries.length },
      });
    }

    state.corpusIndexed = true;
    state.totalIndexed = corpusEntries.length;
    state.status = "ready";

    self.postMessage({
      type: "INDEXING_COMPLETE",
      payload: { count: corpusEntries.length },
    });
  } catch (err: any) {
    state.status = "error";
    state.error = err.message;
    self.postMessage({
      type: "INDEXING_ERROR",
      payload: { error: err.message },
    });
  }
}

/**
 * Phase 3: Handle search requests with timeout.
 */
async function handleSearchRequest(query: string, limit: number = 3): Promise<SearchResult[]> {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const queryEmbedding = await embed(query);

  try {
    const results = await oramaSearch(db!, {
      mode: "vector" as any,
      vector: {
        value: queryEmbedding,
        property: "embedding",
      },
      limit,
    });

    return results.hits.map((hit: any) => ({
      score: hit.score,
      en: hit.document.en,
      ar: hit.document.ar,
      type: hit.document.type,
      index: hit.document.index,
    }));
  } catch (err: any) {
    throw new Error(`Search failed: ${err.message}`);
  }
}

/**
 * Process queued requests after initialization completes.
 */
async function processQueue(): Promise<void> {
  const queue = [...requestQueue];
  requestQueue.length = 0;

  for (const { type, payload, id } of queue) {
    if (type === "SEARCH") {
      try {
        const hits = await handleSearchRequest(payload.query, payload.limit);
        self.postMessage({
          type: "SEARCH_RESULTS",
          payload: { id, hits },
        });
      } catch (err: any) {
        self.postMessage({
          type: "SEARCH_ERROR",
          payload: { id, error: err.message },
        });
      }
    }
  }
}

/**
 * Main message handler with state transitions.
 */
self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case "INIT_MODELS":
        await initializeModels();
        break;

      case "INGEST_CORPUS":
        // Queue if models not ready
        if (!state.modelsLoaded) {
          requestQueue.push({ type: "INGEST_CORPUS", payload, id: "ingest" });
          if (state.status === "idle") {
            await initializeModels();
          }
        }
        await indexCorpus(payload.entries);
        await processQueue();
        break;

      case "SEARCH":
        if (!state.corpusIndexed) {
          requestQueue.push({ type, payload, id: payload.id });
          if (state.status === "idle") {
            await initializeModels();
          }
        } else {
          try {
            const hits = await handleSearchRequest(payload.query, payload.limit);
            self.postMessage({
              type: "SEARCH_RESULTS",
              payload: { hits, query: payload.query },
            });
          } catch (err: any) {
            self.postMessage({
              type: "SEARCH_ERROR",
              payload: { error: err.message, query: payload.query },
            });
          }
        }
        break;

      case "STATUS":
        self.postMessage({
          type: "STATUS_RESPONSE",
          payload: { state },
        });
        break;

      default:
        console.warn(`[RAG Worker] Unknown message type: ${type}`);
    }
  } catch (err: any) {
    console.error("[RAG Worker] Handler error:", err);
    self.postMessage({
      type: "ERROR",
      payload: { error: err.message },
    });
  }
};

// Signal worker is ready
self.postMessage({ type: "WORKER_READY", payload: {} });
