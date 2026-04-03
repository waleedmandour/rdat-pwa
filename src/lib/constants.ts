// ─── App Constants ──────────────────────────────────────────────────

export const APP_NAME = "RDAT Copilot";
export const APP_SHORT_NAME = "RDAT";
export const APP_VERSION = "0.1.0";
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

// ─── RAG / Vector DB ────────────────────────────────────────────────
export const VECTOR_DB_NAME = "rdat-gtr";
export const VECTOR_DB_VERSION = 1;
export const CORPUS_BOOTSTRAP_URL =
  "https://huggingface.co/datasets/Helsinki-NLP/opus-100/resolve/main/en-ar/v1/test.jsonl";

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
