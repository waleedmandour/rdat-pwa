// ─── App Constants ──────────────────────────────────────────────────

import type { LanguageDirection, LanguagePair } from "@/types";

export const APP_NAME = "RDAT Copilot";
export const APP_SHORT_NAME = "RDAT";
export const APP_VERSION = "2.0.0";
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
export const LOCAL_MODEL_DISPLAY_NAME = "Gemma 2 (INT4 Quantized)";
export const LOCAL_MODEL_FAMILY = "Gemma";
export const LOCAL_MODEL_CACHE_KEY = "rdat-local-model-cache";
export const LOCAL_MODEL_INIT_TIMEOUT_MS = 300_000; // 5 minutes for first model download
export const LLM_MAX_TOKENS = 50; // Ghost text should be short
export const LLM_TEMPERATURE = 0.3; // Low temperature for predictable completions

// ─── Language Direction ─────────────────────────────────────────────

export const LANGUAGE_PAIRS: Record<LanguageDirection, LanguagePair> = {
  "en-ar": {
    source: "en",
    target: "ar",
    sourceLabel: "English",
    targetLabel: "Arabic",
    sourceLabelAr: "الإنجليزية",
    targetLabelAr: "العربية",
  },
  "ar-en": {
    source: "ar",
    target: "en",
    sourceLabel: "Arabic",
    targetLabel: "English",
    sourceLabelAr: "العربية",
    targetLabelAr: "الإنجليزية",
  },
};

export const LANG_DIRECTION_STORAGE = "rdat-lang-direction";

export const DEFAULT_REWRITE_INSTRUCTION: Record<LanguageDirection, string> = {
  "en-ar": "Evaluate this Arabic translation against the English source for accuracy, then rewrite to match a formal legal register while preserving the original meaning.",
  "ar-en": "Evaluate this English translation against the Arabic source for accuracy, then rewrite to match a formal legal register while preserving the original meaning.",
};

export const SYSTEM_PROMPTS: Record<LanguageDirection, string> = {
  "en-ar": `You are an English-Arabic co-writing translation assistant operating in a split-pane CAT (Computer-Assisted Translation) workspace.

CONTEXT: The user is translating a source document from English to Arabic. You will receive:
- A Source Sentence: the original English sentence from the source pane
- Translation Memory matches: relevant glossary entries from a terminology database
- Current Target Draft: what the translator has typed so far in Arabic

CRITICAL RULES:
1. Output ONLY the next few words to complete the Arabic translation draft.
2. Do NOT provide commentary, explanations, or full translations.
3. Do NOT repeat what the user has already written in the target draft.
4. Keep your suggestion to 3-15 words maximum.
5. Use the Source Sentence as the primary reference for meaning.
6. Use Translation Memory entries for consistent terminology.
7. Match the tone and register of the surrounding text (legal, technical, formal).
8. Maintain grammatical agreement with the existing Arabic draft.
9. Never output markdown, formatting, or code blocks.`,
  "ar-en": `You are an Arabic-English co-writing translation assistant operating in a split-pane CAT (Computer-Assisted Translation) workspace.

CONTEXT: The user is translating a source document from Arabic to English. You will receive:
- A Source Sentence: the original Arabic sentence from the source pane
- Translation Memory matches: relevant glossary entries from a terminology database
- Current Target Draft: what the translator has typed so far in English

CRITICAL RULES:
1. Output ONLY the next few words to complete the English translation draft.
2. Do NOT provide commentary, explanations, or full translations.
3. Do NOT repeat what the user has already written in the target draft.
4. Keep your suggestion to 3-15 words maximum.
5. Use the Source Sentence as the primary reference for meaning.
6. Use Translation Memory entries for consistent terminology.
7. Match the tone and register of the surrounding text (legal, technical, formal).
8. Maintain grammatical agreement with the existing English draft.
9. Never output markdown, formatting, or code blocks.`,
};

// ─── Cloud AI (Reasoning Track) ─────────────────────────────────────
export const GEMINI_SYSTEM_PROMPTS: Record<LanguageDirection, string> = {
  "en-ar": `You are an expert English-Arabic legal translator. You receive both the original source text (English) and the translator's draft (Arabic). Your task is to evaluate the accuracy of the translation against the source, then rewrite the Arabic draft according to the instruction given. If no instruction is given, rewrite to match a formal legal register in Arabic while preserving meaning. Output ONLY the rewritten Arabic text, no commentary or explanation.`,
  "ar-en": `You are an expert Arabic-English legal translator. You receive both the original source text (Arabic) and the translator's draft (English). Your task is to evaluate the accuracy of the translation against the source, then rewrite the English draft according to the instruction given. If no instruction is given, rewrite to match a formal legal register in English while preserving meaning. Output ONLY the rewritten English text, no commentary or explanation.`,
};

export const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent";

// ─── UI Labels (Bilingual) ──────────────────────────────────────────
export const MODE_LABELS = {
  local: "Sovereign (Local GPU)",
  cloud: "Cloud (Gemini API)",
  hybrid: "Hybrid (Local + Cloud)",
} as const;

export const MODE_LABELS_AR = {
  local: "سيادي (معالج محلي)",
  cloud: "سحابي (Gemini)",
  hybrid: "هجين (محلي + سحابي)",
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

export const RAG_STATE_LABELS_AR = {
  idle: "قاموس: خامل",
  "loading-model": "قاموس: تحميل النموذج…",
  indexing: "قاموس: فهرسة…",
  ready: "قاموس: جاهز",
  searching: "قاموس: بحث…",
  error: "قاموس: خطأ",
} as const;

export const WEBLLM_STATE_LABELS = {
  idle: "LLM: Idle",
  initializing: "LLM: Loading…",
  ready: "LLM: Ready",
  generating: "LLM: Generating…",
  error: "LLM: Error",
} as const;

export const WEBLLM_STATE_LABELS_AR = {
  idle: "النموذج المحلي: خامل",
  initializing: "النموذج المحلي: تحميل…",
  ready: "النموذج المحلي: جاهز",
  generating: "النموذج المحلي: توليد…",
  error: "النموذج المحلي: خطأ",
} as const;

// ─── Cloud AI (Reasoning Track) ─────────────────────────────────────
export const GEMINI_MODEL_ID = "gemini-3.1-flash-lite-preview";
export const GEMINI_API_KEY_STORAGE = "rdat-gemini-api-key";

// ─── AMTA Linter ───────────────────────────────────────────────────
export const AMTA_LINT_DEBOUNCE_MS = 2000; // 2 seconds after typing stops
export const AMTA_MARKER_OWNER = "rdat-amta-linter";
export const AMTA_MIN_TERM_LENGTH = 3; // Minimum term length to lint

// ─── Bilingual UI Labels ───────────────────────────────────────────
export const UI_LABELS = {
  translationEditor: { ar: "محرر الترجمة", en: "Translation Editor" },
  sovereignTrack: { ar: "المسار السيادي", en: "Sovereign Track" },
  reasoningTrack: { ar: "مسار الاستدلال", en: "Reasoning Track" },
  glossary: { ar: "مسرد المصطلحات", en: "Terminology Glossary" },
  aiModels: { ar: "نماذج الذكاء الاصطناعي", en: "AI Models" },
  settings: { ar: "الإعدادات", en: "Settings" },
  general: { ar: "عام", en: "General" },
  languages: { ar: "اللغات", en: "Languages" },
  apiKeys: { ar: "مفاتيح API", en: "API Keys" },
  welcome: { ar: "مرحبًا", en: "Welcome" },
  rewrite: { ar: "إعادة صياغة", en: "Rewrite" },
  accept: { ar: "قبول", en: "Accept" },
  dismiss: { ar: "رفض", en: "Dismiss" },
  autoSuggest: { ar: "اقتراح تلقائي للترجمة", en: "Auto-suggest Translations" },
  amtaLinting: { ar: "فحص جودة الترجمة", en: "Translation Quality Linting" },
  ghostTextHint: { ar: "اضغط Tab لقبول · نص مقترح", en: "Tab to accept · Ghost text active" },
} as const;
