// ─── App Constants ──────────────────────────────────────────────────

export const APP_NAME = "RDAT Copilot";
export const APP_SHORT_NAME = "RDAT";
export const APP_VERSION = "0.3.0";
export const APP_DESCRIPTION =
  "Repository-Driven Adaptive Translation — AI-Powered Co-Writing IDE";

// ─── GPU Thresholds ─────────────────────────────────────────────────
export const GPU_CHECK_TIMEOUT_MS = 10_000; // 10 seconds
export const INFERENCE_ABORT_DELAY_MS = 50; // Debounce before aborting inference

// ─── Editor Constants ───────────────────────────────────────────────
export const DEFAULT_SOURCE_LANG = "en";
export const DEFAULT_TARGET_LANG = "ar";
export const DEBOUNCE_DELAY_MS = 300; // Keystroke debounce for editor
export const GHOST_TEXT_DEBOUNCE_MS = 150; // Faster debounce for ghost text

// ─── Mock Inference (Phase 2 placeholder) ───────────────────────────
export const MOCK_INFERENCE_DELAY_MS = 1500; // Simulated AI generation delay

// ─── RAG / Vector DB (Phase 3) ─────────────────────────────────────
export const EMBEDDING_DIMENSIONS = 384; // MiniLM-L12-v2 output dimensions
export const EMBEDDING_MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const MODEL_LOAD_TIMEOUT_MS = 60_000; // 60s timeout for model download
export const CORPUS_BOOTSTRAP_URL = "/opus-glossary-en-ar.json";
export const RAG_SEARCH_LIMIT = 3; // Top K results
export const RAG_SEARCH_TARGET_MS = 50; // Target: vector search < 50ms

// ─── Vector DB ──────────────────────────────────────────────────────
export const VECTOR_DB_NAME = "rdat-gtr";
export const VECTOR_DB_VERSION = 1;

// ─── Local AI (Sovereign Track) ────────────────────────────────────
export const LOCAL_MODEL_ID = "gemma-4-2b-it-q4f16_1-MLC";
export const LOCAL_MODEL_CACHE_KEY = "rdat-local-model-cache";

// ─── Cloud AI (Reasoning Track) ─────────────────────────────────────
export const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// ─── UI Labels ──────────────────────────────────────────────────────
export const MODE_LABELS = {
  local: "Sovereign (Local GPU)",
  cloud: "Cloud (Gemini API)",
  hybrid: "Hybrid (Local + Cloud)",
} as const;

export const GPU_STATUS_LABELS = {
  checking: "Detecting GPU...",
  supported: "WebGPU Ready",
  unsupported: "WebGPU Unavailable",
  error: "GPU Error",
} as const;

export const INFERENCE_STATE_LABELS = {
  idle: "Ready",
  running: "Generating…",
  aborted: "Aborted",
  completed: "Done",
} as const;

export const RAG_STATE_LABELS = {
  idle: "GTR: Idle",
  "loading-model": "GTR: Loading model…",
  indexing: "GTR: Indexing…",
  ready: "GTR: Ready",
  searching: "GTR: Searching…",
  error: "GTR: Error",
} as const;
