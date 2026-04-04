// ─── RAG Worker Message Protocol ────────────────────────────────────
// Typed messages for Main Thread ↔ Web Worker communication.

/** Corpus entry as stored in the vector database */
export interface CorpusEntry {
  id: string;
  en: string;
  ar: string;
  context: string;
}

/** A single RAG search result with similarity score */
export interface RAGResult {
  id: string;
  en: string;
  ar: string;
  context: string;
  score: number;
}

/** Timing breakdown for a search operation */
export interface RAGTiming {
  embedMs: number;
  searchMs: number;
  totalMs: number;
}

// ─── Main → Worker Messages ─────────────────────────────────────────

export type WorkerRequest =
  | { type: "bootstrap"; corpusUrl: string }
  | { type: "search"; query: string; requestId: string }
  | { type: "get-status" };

// ─── Worker → Main Messages ─────────────────────────────────────────

export type RAGState =
  | "idle"
  | "loading-model"
  | "indexing"
  | "ready"
  | "searching"
  | "error";

export type WorkerResponse =
  | { type: "status"; state: RAGState; message: string; progress?: number; embeddingMode?: "real" | "fallback" }
  | { type: "search-result"; requestId: string; results: RAGResult[]; timing: RAGTiming }
  | { type: "bootstrap-complete"; count: number; embeddingMode: "real" | "fallback" }
  | { type: "log"; level: "info" | "warn" | "error"; message: string };
