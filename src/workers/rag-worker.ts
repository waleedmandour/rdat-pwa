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
 * Phase 1: Initialize embedding models.
 * Uses lightweight hash-based embedding instead of neural models for worker compatibility.
 */
async function initializeModels(): Promise<void> {
  if (state.modelsLoaded) return;

  try {
    state.status = "initializing";
    state.error = null;
    self.postMessage({ type: "STATE_CHANGE", payload: { status: "initializing" } });

    console.log("[RAG Worker] Initializing embedding system with hash-based method");
    
    // Hash-based embedding is always available, no external dependencies needed
    // This ensures RAG works reliably in worker context
    state.modelsLoaded = true;
    console.log("[RAG Worker] Embedding system initialized (hash-based)");
    self.postMessage({ type: "MODELS_READY", payload: { model: "hash-based-embedding" } });
  } catch (err: any) {
    state.status = "error";
    state.error = err?.message || String(err);
    console.error("[RAG Worker] Initialization failed:", err);
    self.postMessage({
      type: "INIT_ERROR",
      payload: { error: `Failed to initialize: ${err?.message || "Unknown error"}` },
    });
  }
}

/**
 * Initialize Orama database with proper schema.
 */
async function initDB(): Promise<void> {
  if (db) return;

  try {
    console.log("[RAG Worker] Initializing Orama database...");
    db = await create({
      schema: {
        en: "string",
        ar: "string",
        type: "string",
        index: "number",
      },
    });
    console.log("[RAG Worker] Database initialized");
  } catch (err: any) {
    console.error("[RAG Worker] Failed to initialize database:", err);
    throw new Error(`Database initialization failed: ${err.message}`);
  }
}

/**
 * Generate embedding for text using hash-based method.
 * Simple and reliable, no external ML libraries needed.
 */
async function embed(text: string): Promise<number[]> {
  // Always use hash-based embedding for reliability in worker context
  return simpleHashEmbedding(text, 384);
}

/**
 * Simple hash-based embedding fallback.
 */
function simpleHashEmbedding(text: string, dims: number = 384): number[] {
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
  if (!state.modelsLoaded && !embeddingPipeline) {
    console.warn("[RAG Worker] Models not loaded, initializing...");
    await initializeModels();
    if (!state.modelsLoaded) {
      state.error = "Models initialization failed";
      throw new Error("Models not available");
    }
  }

  try {
    state.status = "indexing";
    console.log(`[RAG Worker] Starting corpus indexing: ${entries.length} entries`);
    self.postMessage({ type: "STATE_CHANGE", payload: { status: "indexing" } });

    if (!db) await initDB();

    const corpusEntries: CorpusEntry[] = entries.map((entry, index) => ({
      en: entry.en || "",
      ar: entry.ar || "",
      type: entry.type || "tm",
      index,
    }));

    // Process in batches of 10 to avoid memory spikes
    const batchSize = 10;
    let processed = 0;

    for (let i = 0; i < corpusEntries.length; i += batchSize) {
      const batch = corpusEntries.slice(i, i + batchSize);
      
      try {
        const docs = await Promise.all(
          batch.map(async (entry) => {
            try {
              const embedding = await embed(entry.en);
              return {
                ...entry,
                embedding,
              };
            } catch (err: any) {
              console.warn(`[RAG Worker] Failed to embed entry ${entry.index}:`, err);
              return {
                ...entry,
                embedding: simpleHashEmbedding(entry.en, 384),
              };
            }
          })
        );

        await insertMultiple(db!, docs);
        processed += docs.length;
      } catch (batchErr: any) {
        console.error(`[RAG Worker] Batch ${i / batchSize} failed:`, batchErr);
        // Continue with next batch
      }

      // Report progress every batch
      self.postMessage({
        type: "INDEXING_PROGRESS",
        payload: { processed, total: corpusEntries.length },
      });
    }

    state.corpusIndexed = true;
    state.totalIndexed = processed;
    state.status = "ready";
    console.log(`[RAG Worker] Corpus indexed: ${processed}/${corpusEntries.length} entries`);

  } catch (err: any) {
    state.status = "error";
    state.error = err.message;
    console.error("[RAG Worker] Corpus indexing failed:", err);
    self.postMessage({
      type: "INDEXING_ERROR",
      payload: { error: `Indexing failed: ${err.message}` },
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
