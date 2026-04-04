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

// ─── RAG / Vector DB (GTR) ─────────────────────────────────────────
export const EMBEDDING_DIMENSIONS = 384; // MiniLM-L12-v2 output dimensions
export const EMBEDDING_MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const MODEL_LOAD_TIMEOUT_MS = 60_000; // 60s timeout for model download
export const DEFAULT_CORPUS_URL = "/data/default-corpus-en-ar.json";
export const CORPUS_BOOTSTRAP_URL = DEFAULT_CORPUS_URL; // Legacy alias
export const CORPUS_CACHE_KEY = "rdat-gtr-corpus-cache";
export const CORPUS_CACHE_VERSION = "v4";
export const RAG_SEARCH_LIMIT = 5; // Top K results (increased for richer terminology display)
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

// ─── Workspace Autosave ──────────────────────────────────────────────
export const WORKSPACE_AUTOSAVE_KEY = "rdat-workspace-autosave";
export const WORKSPACE_AUTOSAVE_DEBOUNCE_MS = 2000; // 2 seconds

// ─── Default Texts (WikiMatrix-aligned) ──────────────────────────────

/**
 * Default source text: Great Pyramid of Giza encyclopedic text.
 * Sourced from Wikipedia (WikiMatrix-aligned, EN→AR parallel corpus).
 * Used when no user text is loaded and no autosaved state exists.
 */
export const DEFAULT_SOURCE_TEXT_EN = `The Great Pyramid of Giza is the oldest and largest of the three pyramids in the Giza pyramid complex bordering present-day Giza in Greater Cairo, Egypt. It is the oldest of the Seven Wonders of the Ancient World, and the only one to remain largely intact.

The Great Pyramid was built as a tomb for the Fourth Dynasty pharaoh Khufu, also known by his Greek name Cheops. Construction of the pyramid is thought to have taken approximately twenty years, employing a workforce of around 100,000 skilled laborers and craftsmen. The pyramid originally stood at 146.6 metres, making it the tallest man-made structure in the world for over 3,800 years.

The interior of the Great Pyramid contains three main chambers: the King's Chamber, the Queen's Chamber, and a lower chamber cut into the bedrock beneath the structure. The King's Chamber contains a large granite sarcophagus, and the walls are made of smoothly polished red granite. The Grand Gallery, a long ascending passage, leads to the King's Chamber and features a corbelled ceiling that rises to a height of 8.6 metres.

The pyramid was constructed using an estimated 2.3 million limestone blocks, each weighing an average of 2.5 tons. The precision of the construction is remarkable, with the base being level to within just 2.1 centimetres across its entire 230-metre length. The casing stones that once covered the pyramid were highly polished white limestone, giving the structure a brilliant appearance that could be seen from miles away.

Modern archaeological research has revealed that the Great Pyramid was part of a larger mortuary complex that included temples, causeways, and smaller satellite pyramids. The complex served as a central element in ancient Egyptian funerary practices and religious beliefs about the afterlife. Today, the Great Pyramid remains one of the most iconic and studied structures in human history, attracting millions of visitors each year and continuing to inspire archaeological and scientific investigation.`;

/**
 * Default Arabic translation text (partial — to demonstrate workspace functionality).
 * This is an intentionally incomplete translation to show the user where to begin.
 */
export const DEFAULT_TARGET_TEXT_AR = `أهرام الجيزة العظيم هو أقدم وأكبر الأهرامات الثلاثة في مجموعة أهرامات الجيزة الحدودية لمدينة الجيزة الحالية في القاهرة الكبرى، مصر. إنه أقدم عجائب الدنيا السبع القديمة، والوحيد الذي بقي سليماً إلى حد كبير.

بُني الهرم الأكبر كضريح للفرعون خوفو من الأسرة الرابعة، المعروف أيضاً باسمه اليوناني خيوبس. يُعتقد أن بناء الهرم استغرق حوالي عشرين عاماً، حيث شارك في البناء حوالي 100,000 عامل ماهر وحرفي. كان ارتفاع الهرم الأصلي 146.6 متراً، مما جعله أطول بناء من صنع الإنسان في العالم لأكثر من 3,800 عام.`;

/**
 * Default Arabic source text for AR→EN mode.
 * WikiMatrix-aligned encyclopedic content.
 */
export const DEFAULT_SOURCE_TEXT_AR = `أهرام الجيزة العظيم هو أقدم وأكبر الأهرامات الثلاثة في مجموعة أهرامات الجيزة. يقع في الجيزة على مشارف القاهرة الكبرى في مصر. يُعد الهرم الأكبر أقدم عجائب الدنيا السبع في العالم القديم، وهو العجابة الوحيدة التي لا تزال قائمة إلى حد كبير حتى اليوم.

تم بناء الهرم الأكبر كمقبرة للفرعون خوفو من الأسرة الرابعة. يُقدر أن البناء استغرق حوالي عشرين عاماً، بمشاركة حوالي مئة ألف عامل وحرفي. كان ارتفاع الهرم الأصلي 146.6 متراً، وكان بذلك أطول مبنى صنعه الإنسان في العالم لأكثر من ثلاثة آلاف وثمانمئة عام. يتكون الجزء الداخلي من الهرم من ثلاث حجرات رئيسية: حجرة الملك وحجرة الملكة وحجرة منخفضة محفورة في الصخر تحت البناء.`;

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
  local: "مسار التحكم (علي الجهاز)",
  cloud: "سحابي (Gemini)",
  hybrid: "هجين (مسار تحكم + سحابي)",
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
  idle: "ذكاء اصطناعي مثبت علي الجهاز: خامل",
  initializing: "ذكاء اصطناعي مثبت علي الجهاز: تحميل…",
  ready: "ذكاء اصطناعي مثبت علي الجهاز: جاهز",
  generating: "ذكاء اصطناعي مثبت علي الجهاز: توليد…",
  error: "ذكاء اصطناعي مثبت علي الجهاز: خطأ",
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
  sovereignTrack: { ar: "مسار التحكم (علي الجهاز)", en: "Sovereign Track" },
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
