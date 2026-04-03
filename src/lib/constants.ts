// ─── App Constants ──────────────────────────────────────────────────

export const APP_NAME = "RDAT Copilot";
export const APP_SHORT_NAME = "RDAT";
export const APP_VERSION = "0.5.0";
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
export const LOCAL_MODEL_ID = "gemma-2b-it-q4f32_1-MLC";
export const LOCAL_MODEL_CACHE_KEY = "rdat-local-model-cache";
export const LOCAL_MODEL_INIT_TIMEOUT_MS = 300_000; // 5 minutes for first model download
export const LLM_MAX_TOKENS = 50; // Ghost text should be short
export const LLM_TEMPERATURE = 0.3; // Low temperature for predictable completions

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

export const WEBLLM_STATE_LABELS = {
  idle: "LLM: Idle",
  initializing: "LLM: Loading…",
  ready: "LLM: Ready",
  generating: "LLM: Generating…",
  error: "LLM: Error",
} as const;

// ─── Cloud AI (Reasoning Track) ─────────────────────────────────────
export const GEMINI_MODEL_ID = "gemini-2.0-flash";
export const GEMINI_API_KEY_STORAGE = "rdat-gemini-api-key";
export const GEMINI_REWRITE_SYSTEM_PROMPT = `You are an expert English-Arabic legal translator. When the user provides text, rewrite it according to the instruction given. If no instruction is given, rewrite to match a formal legal register in Arabic. Output ONLY the rewritten text, no commentary or explanation.`;

// ─── AMTA Linter ───────────────────────────────────────────────────
export const AMTA_LINT_DEBOUNCE_MS = 2000; // 2 seconds after typing stops
export const AMTA_MARKER_OWNER = "rdat-amta-linter";
export const AMTA_MIN_TERM_LENGTH = 3; // Minimum term length to lint
