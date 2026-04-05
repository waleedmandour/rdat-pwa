<div align="center">

# RDAT Copilot

**مساعد الترجمة الذكي — Repository-Driven Adaptive Translation**

[![CI](https://github.com/waleedmandour/rdat-pwa/actions/workflows/ci.yml/badge.svg)](https://github.com/waleedmandour/rdat-pwa/actions/workflows/ci.yml)
[![Deploy on Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/waleedmandour/rdat-pwa)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Progressive Web App that provides a full-featured, AI-powered co-writing environment for English-Arabic translation — running entirely in the browser. Built on a dual-track AI architecture that combines a **Sovereign Track** (local WebGPU inference via Gemma) and a **Reasoning Track** (cloud Gemini API). Translation decisions are guided by an in-browser RAG vector database and an AMTA terminology linter. The **Predictive Prefetch Engine** proactively generates complete dual-version translations (Formal/Literal + Natural/Standard) displayed via a custom Monaco IViewZone below-the-line widget — with dynamic prefix matching that shows only the untyped remainder.

</div>

---

## Author & Affiliation

**Dr. Waleed Mandour**
Sultan Qaboos University (جامعة السلطان قابوس)
📧 [w.abumandour@squ.edu.om](mailto:w.abumandour@squ.edu.om)

RDAT Copilot is a research-informed translation technology tool designed for professional translators working between English and Arabic. It embodies a non-destructive editing philosophy — AI never overwrites the translator's text — and provides intelligent, context-aware suggestions that respect the translator's creative authority.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Predictive Prefetch Engine — محرك الترجمة التنبؤي](#predictive-prefetch-engine--محرك-الترجمة-التنبؤي)
- [Below-The-Line Zone UI — واجهة الاقتراحات](#below-the-line-zone-ui--واجهة-الاقتراحات)
- [Dual-Track AI System](#dual-track-ai-system)
  - [Sovereign Track — المسار المٌتَحَكِم (Local WebGPU)](#sovereign-track--المسار-المٌتَحَكِم-local-webgpu)
  - [Reasoning Track — مسار الاستدلال (Cloud Gemini)](#reasoning-track--مسار-الاستدلال-cloud-gemini)
  - [Track Comparison — مقارنة المسارين](#track-comparison--مقارنة-المسارين)
- [RAG Pipeline — محرك البحث الدلالي](#rag-pipeline--محرك-البحث-الدلالي)
- [AMTA Terminology Linter — فحص جودة الترجمة](#amta-terminology-linter--فحص-جودة-الترجمة)
- [Bilingual Interface — واجهة ثنائية اللغة](#bilingual-interface--واجهة-ثنائية-اللغة)
- [Installing as a PWA — تثبيت كتطبيق](#installing-as-a-pwa--تثبيت-كتطبيق)
- [Setting Up Gemini (BYOK)](#setting-up-gemini-byok)
- [Development — التطوير](#development--التطوير)
- [Deployment — النشر](#deployment--النشر)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Data Sources & Acknowledgements](#data-sources--acknowledgements--مصادر-البيانات-والشكر)
- [License](#license)

---

## Architecture Overview

### System Workflow Diagram — مخطط سير العمل

```mermaid
flowchart TB
    Start([RDAT Copilot]) --> Browser{WebGPU Supported?}
    Browser -->|Yes| Hybrid[Hybrid Mode]
    Browser -->|No| CloudMode[Cloud Mode]
    Hybrid --> SplitPane[Split-Pane CAT Workspace]
    CloudMode --> SplitPane
    SplitPane --> SourcePane[Source Pane LEFT - readOnly]
    SplitPane --> TargetPane[Target Pane RIGHT - Active Editor]
    SourcePane --> EditBtn[Edit Button - Paste Source]
    TargetPane --> Keystroke[Translator Types]
    Keystroke --> Debounce{400ms Debounce}
    Debounce -->|New Keystroke| Interrupt[Interrupt Inference + AbortController]
    Interrupt --> Debounce
    Debounce -->|Fires| TrackLine[Track Cursor Line in Target]
    TrackLine --> ExtractSource[Extract Corresponding Source Line]
    ExtractSource --> PrefetchEngine
    ExtractSource --> RAG_Search
    ExtractSource --> AMTA_Lint
    subgraph Prefetch [Predictive Prefetch Engine v4.0]
        PrefetchEngine[Build Dual-Version Prompt] --> WebLLM[Gemma 2B via WebGPU]
        WebLLM --> Parse[Parse ||| Delimiter]
        Parse --> Cache[TranslationCache Map]
    end
    subgraph Zone [Below-The-Line Zone Widget]
        Cache --> PrefixMatch{Dynamic Prefix Match?}
        PrefixMatch -->|Yes| ShowRemainder[Show Untyped Remainder]
        PrefixMatch -->|No| ShowFull[Show Full Versions]
    end
    subgraph RAG [RAG Pipeline - Source-Driven]
        RAG_Search[Embed SOURCE Sentence] --> TopK[Top 5 TM Matches]
    end
    subgraph AMTA [AMTA Linter]
        AMTA_Lint[Scan TARGET for Terms] --> Check{Translated?}
        Check -->|No| Warning[Squiggle + Quick Fix]
        Check -->|Yes| OK[Pass]
    end
    ShowRemainder --> Decision{Tab / Ctrl+Tab}
    ShowFull --> Decision
    Decision -->|Tab| AcceptV1[Insert Formal/Literal Version]
    Decision -->|Ctrl+Tab| AcceptV2[Insert Natural/Standard Version]
    Decision -->|Type| Dismiss[Continue Typing]
    AcceptV1 --> TargetPane
    AcceptV2 --> TargetPane
    Dismiss --> Keystroke
    TargetPane --> SelectText[Select + Rewrite]
    SelectText --> GetSource[Get Source Sentence]
    GetSource --> Gemini[Gemini - Source + Target]
    Gemini --> RewritePanel[Rewrite Panel]
    RewritePanel --> AcceptRewrite{Accept?}
    AcceptRewrite -->|Yes| Apply[Replace in Target]
    AcceptRewrite -->|No| TargetPane
    SplitPane --> SwapDir[EN to AR / AR to EN]
    SwapDir --> Reset[Reset Both Panes + Clear Cache]
    Reset --> SplitPane
```

### Architecture Layers

RDAT Copilot features a **split-pane CAT (Computer-Assisted Translation) workspace** built with Next.js 16, Monaco Editor, and WebGPU. It runs entirely in the browser with no backend server required. The left pane displays the source document (read-only reference), while the right pane is the active translation editor where the predictive zone widget and linting operate. The architecture follows a non-destructive editing philosophy: AI never overwrites the translator's text.

The system is organized into seven functional layers:

1. **Split-Pane Editor Layer** — Two Monaco Editor instances managed by `react-resizable-panels`. The source pane (left, `rdat-source` language, readOnly) displays the original document. The target pane (right, `rdat-target` language) is the active editor with the Below-The-Line Zone Widget, AMTA linting, and custom keybindings. An "Edit" button allows loading/changing the source text via a textarea overlay.

2. **Predictive Prefetch Engine** — When the active source sentence changes (debounced 400ms), the engine proactively generates a **dual-version translation** (Formal/Literal `|||` Natural/Standard) in the background using the local WebLLM engine. Results are cached in a `Map<sourceSentence, [string, string]>` with `AbortController` cancellation on every new source sentence change. This means translations are often **ready before the translator starts typing**, eliminating wait time.

3. **Below-The-Line Zone Widget** — Replaces standard Monaco inline completions with a custom `IViewZone` injected below the active editor line. Displays two suggestion rows: `[Tab] Formal:` (amber) and `[Ctrl+Tab] Natural:` (sky blue). Features **dynamic prefix matching** that detects when the translator's current line text is a prefix of a cached version, showing only the untyped remainder in purple. RTL-aware with `dir="auto"` on the DOM node.

4. **Source-Driven Event Loop** — When the translator types in the target pane, a 300ms debounce fires and tracks the cursor's line number. The corresponding line is extracted from the **source pane** (not the target draft) and sent to the RAG pipeline for semantic search. This ensures that terminology matches are based on the original source meaning.

5. **RAG Layer (Source-Driven)** — An Orama vector database in a Web Worker, bootstrapped via the `useGTRBootstrapper` hook with localStorage corpus caching. Embeddings via Transformers.js (paraphrase-multilingual-MiniLM-L12-v2, 384 dimensions). The search query is always derived from the **source text**, not the target draft, producing more semantically relevant Translation Memory matches. Falls back to deterministic hash-based pseudo-embeddings on model load failure.

6. **Cloud Synthesis (Source-Aware)** — Gemini rewrites receive both the selected target text AND its corresponding source sentence, enabling accuracy-aware stylistic rewriting. Results appear in a side panel with Accept/Dismiss controls.

7. **AMTA Linting Layer** — Scans the **target text** for untranslated source-language terms, draws yellow squiggles, and offers Ctrl+. autocorrections sourced from the same glossary corpus used by RAG.

---

## Predictive Prefetch Engine — محرك الترجمة التنبؤي

The Predictive Prefetch Engine is the core innovation of RDAT Copilot v4.0. Unlike traditional ghost text that generates a few words at a time after each keystroke, this engine **proactively generates complete dual-version translations** in the background as the translator navigates between source sentences.

### How It Works

The engine is implemented in [`usePredictiveTranslation.ts`](src/hooks/usePredictiveTranslation.ts) and operates through a fully automated pipeline:

1. **Source Sentence Detection** — As the translator moves the cursor in the target pane, `getSourceSentence()` extracts the corresponding sentence from the source pane via line number matching. This sentence becomes the prefetch key.

2. **Debounced Trigger** — A 400ms debounce (`PREFETCH_DEBOUNCE_MS`) prevents excessive GPU usage when the cursor moves rapidly. When the debounce fires, the engine checks its `TranslationCache` for an existing hit before starting generation.

3. **Abort & Cancel** — If a previous prefetch is still running, a dual-layer cancellation fires: `abortController.abort()` + `engine.interruptGenerate()`. This ensures stale translations never consume GPU resources.

4. **RAG-Enhanced Prompt** — The engine builds a structured prompt via `buildDualVersionPrompt()` that includes the source sentence, language direction, and any available RAG results as Translation Memory references. The prompt instructs the LLM to produce exactly two versions separated by `|||`.

5. **Dual-Version Generation** — WebLLM (Gemma 2B INT4 via WebGPU) generates both translation versions in a single inference pass. The `|||` delimiter parser (`parseDualVersionResponse`) handles multiple output formats including numbered lists, labeled versions, and newline-separated fallbacks.

6. **Cache Storage** — Parsed results are stored in a `Map<string, [string, string]>` keyed by the source sentence. Subsequent accesses to the same source sentence return instantly from cache without GPU inference.

7. **Single-Version Fallback** — If the LLM output cannot be parsed into two versions (e.g., the model returned only one translation), the single result is used for both slots as a graceful degradation.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  Predictive Prefetch Engine                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  activeSourceSentence ────┬── Cache Hit? ── YES ── Return   │
│       (400ms debounce)     │                                │
│                            └── NO ── Abort Previous ──────┐ │
│                                                         │ │
│  ┌──────────────────────────────────────────────────┐  │ │
│  │           buildDualVersionPrompt()               │  │ │
│  │  ┌────────────┐  ┌──────────┐  ┌─────────────┐ │  │ │
│  │  │ Source     │  │ RAG TM   │  │ Direction   │ │  │ │
│  │  │ Sentence   │  │ Matches  │  │ (EN↔AR)     │ │  │ │
│  │  └────────────┘  └──────────┘  └─────────────┘ │  │ │
│  └───────────────────┬──────────────────────────────┘  │ │
│                      │                                 │ │
│                      ▼                                 │ │
│  ┌──────────────────────────────────────────────────┐  │ │
│  │       WebLLM (Gemma 2B INT4 via WebGPU)          │  │ │
│  │  Output: "Version1 ||| Version2"                  │  │ │
│  └───────────────────┬──────────────────────────────┘  │ │
│                      │                                 │ │
│                      ▼                                 │ │
│  ┌──────────────────────────────────────────────────┐  │ │
│  │       parseDualVersionResponse()                 │  │ │
│  │  "Formal ||| Natural" → ["Formal", "Natural"]     │  │ │
│  │  Fallback: newline separation, single version    │  │ │
│  └───────────────────┬──────────────────────────────┘  │ │
│                      │                                 │ │
│                      ▼                                 │ │
│  ┌──────────────────────────────────────────────────┐  │ │
│  │       TranslationCache (Map)                     │  │ │
│  │  sourceSentence → [Formal/Literal, Natural/Std]  │  │ │
│  └──────────────────────────────────────────────────┘  │ │
│                                                         │ │
└─────────────────────────────────────────────────────────┘
```

### API — `usePredictiveTranslation` Hook

```typescript
const predictive = usePredictiveTranslation({
  activeSourceSentence,   // Current source sentence from line tracking
  languageDirection,      // "en-ar" | "ar-en"
  generate,               // WebLLM generate function
  interruptGenerate,      // WebLLM interrupt function
  isLLMReady,             // Whether the LLM engine is loaded
  ragSearch,              // RAG search function
  ragResults,             // Latest RAG results
  isRAGReady,             // Whether RAG pipeline is ready
});

// Returns:
const {
  cache,                  // TranslationCache (Map)
  cacheVersion,           // Incremented on cache update (triggers re-renders)
  isPrefetching,          // boolean — generation in progress
  error,                  // string | null — last error
  prefetchingSentence,    // string | null — sentence being generated
  prefetchTranslation,    // Imperative trigger function
  interruptPrefetch,      // Force-cancel current prefetch
  getCachedVersions,      // (sentence) => [v1, v2] | null
  clearCache,             // Clear entire cache
} = predictive;
```

---

## Below-The-Line Zone UI — واجهة الاقتراحات

The Below-The-Line Zone UI replaces Monaco's standard `registerInlineCompletionsProvider` with a custom `IViewZone` widget that renders below the active editor line. This architecture provides richer, multiline suggestions with better visual distinction and more flexible interaction patterns.

### Design Philosophy

Traditional ghost text (inline completions) is limited to a single line of dimmed text at the cursor position, making it difficult to present alternative translations. The Zone UI breaks free from this constraint by injecting a dedicated widget below the active line that can display multiple translation versions simultaneously, complete with keyboard shortcut labels and visual differentiation through color coding.

### Visual Layout

```
┌────────────────────────────────────────────────────────────┐
│  SOURCE (English)          │  TARGET (Arabic)               │
│                            │                                │
│  The Great Pyramid of      │  أهرام الجيزة العظيم هو أقدم   │
│  Giza is the oldest and    │  وأكبر الأهرامات الثلاثة في     │  ← Active Line
│  largest of the three...   │                                │
│                            │  ┌──────────────────────────┐   │
│                            │  │ ⟳ Predicting translations… │   │  ← Prefetch Spinner
│                            │  └──────────────────────────┘   │
│                            │                                │
│  ...continues...           │  ...or once cached:            │
│                            │  ┌──────────────────────────┐   │
│                            │  │ [Tab] Formal: وأكبر الأهر │   │  ← Amber
│                            │  │ [Ctrl+Tab] Natural: أقدم  │   │  ← Sky Blue
│                            │  └──────────────────────────┘   │
│                            │                                │
└────────────────────────────────────────────────────────────┘
```

### Dynamic Prefix Matching

The Zone UI implements intelligent prefix matching that adapts its display based on what the translator has already typed:

- **Empty line** → Both full versions are displayed
- **Prefix match detected** → Only the **untyped remainder** is shown in purple, reducing visual clutter and making it immediately clear what will be inserted
- **No match** → Full versions are displayed (the translator may be going a different direction)
- **Partial word match** → Handles in-progress word completion by comparing the last typed word against the corresponding position in the cached version

```
// Example: Translator has typed "أهرام الجيزة"
// Cached Version 1: "أهرام الجيزة العظيم هو أقدم وأكبر الأهرامات"
//                            ↑──── remainder shown in purple ────→ "العظيم هو أقدم وأكبر الأهرامات"
```

### Keybindings

| Key | Action | Description |
|-----|--------|-------------|
| **Tab** | Insert Version 1 | Accepts the Formal/Literal translation at cursor position |
| **Ctrl+Tab** | Insert Version 2 | Accepts the Natural/Standard translation at cursor position |
| Continue typing | Dismiss | Naturally dismisses suggestions; triggers new prefetch if source sentence changes |

### RTL Support

The Zone widget sets `dir="auto"` on its DOM node, enabling native bidirectional text rendering. For EN→AR translations, the zone renders right-to-left; for AR→EN, it renders left-to-right. This ensures Arabic text appears correctly positioned within the Monaco editor context.

### Implementation Details

- **Style Injection**: CSS is injected once via `injectViewZoneStyles()` using a document-level `<style>` element with the `.rdat-predictive-zone` namespace
- **Zone Lifecycle**: Created/updated/removed via `editor.changeViewZones()` callback in `updateViewZone()`
- **Disposal**: All zone IDs, commands, and disposables are cleaned up on editor unmount
- **Null Safety**: The entire zone creation pipeline is wrapped in try-catch with null-safe access patterns to prevent the `.length` crash bug

---

## Dual-Track AI System

### Sovereign Track — المسار المٌتَحَكِم (Local WebGPU)

The Sovereign Track runs a quantized Gemma 2B model entirely in the browser using [WebLLM](https://github.com/mlc-ai/web-llm). In v4.0, it powers both the **Predictive Prefetch Engine** (background dual-version generation) and serves as a fallback for the event-loop ghost text pipeline.

**How it works:**

1. When the debounce timer fires after a source sentence change, the prefetch engine builds a structured prompt with the source sentence, RAG context, and dual-version instructions.
2. The prompt is sent to the WebLLM engine running Gemma 2B (INT4 quantized) via WebGPU.
3. Generated text is parsed for the `|||` delimiter, extracting two complete translation versions.
4. Results are cached and displayed in the Below-The-Line Zone Widget — the translator presses Tab or Ctrl+Tab to accept.

**Latency Trap Prevention — منع اختبار الكمون:**

Every source sentence change while inference is running fires a two-layer cancellation: `abortController.abort()` + `engine.interruptGenerate()`. Stale completions never consume GPU resources. Additionally, typing in the target editor triggers `interruptPrefetch()` to immediately free the GPU for a responsive typing experience.

**Gemma 4 Roadmap — خارطة طريق جيما 4:**

RDAT Copilot targets the [Gemma 4](https://deepmind.google/models/gemma/gemma-4/) model family by Google DeepMind for the Sovereign Track. The current release uses Gemma 2B (INT4 quantized) as the most performant model available in the WebLLM framework. Integration of Gemma 4 will be enabled as soon as WebLLM releases compatible model weights, delivering significantly enhanced translation quality for the local inference path.

### Reasoning Track — مسار الاستدلال (Cloud Gemini)

The Reasoning Track uses Google's Gemini API for heavier tasks requiring more reasoning capacity than the local 2B model.

**How it works:**

1. The translator selects text in the editor and clicks "✨ Rewrite" (إعادة صياغة).
2. The selected text, along with its corresponding source sentence and RAG context, is sent to Gemini directly from the browser.
3. Gemini generates a rewritten version matching formal legal register while preserving accuracy against the source.
4. Results appear in a side panel showing the source reference, original translation, and rewritten version — the translator clicks "Accept" (قبول) or "Dismiss" (رفض).

**BYOK Architecture — أدخل مفتاحك الخاص:**

The Gemini API key is stored in the browser's `localStorage` and never sent to any server other than Google's. Each user provides their own key through Settings. `gemini-2.0-flash` is the current model — available on the Free Tier, zero cost for the developer.

### Track Comparison — مقارنة المسارين

| Aspect | Sovereign Track — المسار المٌتَحَكِم | Reasoning Track — مسار الاستدلال |
|--------|----------------|-----------------|
| **Purpose** | Predictive dual-version translation + ghost text | Accuracy-aware rewriting and synthesis |
| **Model** | Gemma 2B (INT4, local WebGPU) | Gemini 2.0 Flash (cloud) |
| **Trigger** | Automatic on source sentence change (400ms debounce) | Manual: select + click Rewrite |
| **Output** | 2 complete translation versions (Formal + Natural) | Full passage in side panel |
| **UI** | Below-The-Line Zone Widget (Tab / Ctrl+Tab) | Accept/Dismiss side panel |
| **Latency** | Target: <500ms (background, non-blocking) | ~1–3s |
| **Network** | Offline after model download | Requires internet |
| **API Key** | None needed | User-provided (BYOK) |
| **Cancellation** | AbortController + interruptGenerate | N/A (one-shot request) |

---

## RAG Pipeline — محرك البحث الدلالي

The Retrieval-Augmented Generation pipeline provides translation memory context for both AI tracks, running entirely in a Web Worker and managed by the [`useGTRBootstrapper`](src/hooks/useGTRBootstrapper.ts) hook.

**Components:**

- **Orama Vector Database** — In-memory store with 384-dimensional embeddings and cosine similarity search.
- **Transformers.js** — `paraphrase-multilingual-MiniLM-L12-v2` for real semantic embeddings. Falls back to deterministic hash-based pseudo-embeddings on model load failure.
- **Corpus** — JSON glossary of English↔Arabic legal/technical term pairs (`default-corpus-en-ar.json`), cached in localStorage for instant re-bootstrap.

**Flow:**

1. On startup, the `useGTRBootstrapper` checks localStorage for a cached corpus (version-tracked via `CORPUS_CACHE_VERSION`). If found, the corpus is sent directly to the Worker, skipping the HTTP fetch entirely.
2. If no cache or version mismatch, the Worker fetches from the corpus URL, generates embeddings, indexes in Orama, and the result is cached for next time.
3. On typing (debounced), the current source sentence is embedded and vector-searched against the corpus.
4. Top 5 matches with scores and timing are returned and injected into the LLM prompt.

**Performance:** Vector search < 50ms (verified with console indicators).

---

## AMTA Terminology Linter — فحص جودة الترجمة

The AMTA linter scans the editor for untranslated English legal terms from the glossary corpus, implemented in [`useAMTALinter.ts`](src/hooks/useAMTALinter.ts).

**How it works:**

1. After the editor debounce settles (2-second delay via `AMTA_LINT_DEBOUNCE_MS`), the linter scans the full editor text.
2. For each English term in the glossary (minimum 3 characters), it performs a case-insensitive search.
3. If an English term is found but the Arabic translation is not present nearby, a lint issue is created.
4. Issues appear as **yellow squiggly warnings** via Monaco's `setModelMarkers` with the `rdat-amta-linter` owner.
5. A **CodeActionProvider** enables **Ctrl+.** quick fixes: `AMTA: Replace "Force Majeure" → "القوة القاهرة"`.

---

## Bilingual Interface — واجهة ثنائية اللغة

RDAT Copilot features a fully bilingual Arabic-English interface, designed for professional translators who work between English and Arabic. Every UI element displays an Arabic subtitle followed by its English description:

- **Header**: "مساعد الترجمة الذكي" — Intelligent Translation Assistant
- **Sidebar**: All menu items include Arabic labels (محرر الترجمة, مسرد المصطلحات, نماذج الذكاء الاصطناعي)
- **Status Bar**: Bilingual mode indicators (سيادي / سحابي / هجين)
- **Settings**: Arabic section headers (عام, اللغات, مفاتيح API, نماذج الذكاء الاصطناعي)
- **Welcome Page**: Arabic hero title "مرحبًا بك في RDAT Copilot" with Quick Start cards
- **Zone Widget Labels**: `[Tab] Formal:` and `[Ctrl+Tab] Natural:` with amber/sky-blue color coding

The IDE layout remains LTR (left-to-right) for optimal editor experience, while Arabic text spans use `dir="rtl"` for correct rendering. Arabic labels are styled in a subtle teal accent to provide visual distinction without overwhelming the interface.

---

## Installing as a PWA — تثبيت كتطبيق

RDAT Copilot is a fully installable Progressive Web App:

### Desktop (Chrome / Edge)
1. Navigate to the deployed URL.
2. Click the **install icon** (⊕) in the address bar, or three-dot menu → "Install RDAT Copilot".
3. The app opens in a standalone window like a native desktop application.

### Mobile (Android)
1. Open the URL in Chrome.
2. Tap **"Add to Home Screen"** banner, or menu → "Install app".

### iOS (Safari)
1. Open the URL in Safari.
2. Tap **Share** → "Add to Home Screen".

### PWA Features
- **Offline-Ready:** Service worker caches all static assets. Sovereign Track works fully offline after model download.
- **Background Sync:** Workbox runtime caching for Google Fonts.
- **Installable:** Meets Chrome's installability criteria (manifest, service worker, HTTPS).

---

## Setting Up Gemini (BYOK)

The Reasoning Track requires a free API key from Google AI Studio:

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) → **Create API Key**.
2. In RDAT Copilot, click the **⚙️ gear icon** → **"مفاتيح API"** tab.
3. Paste your key → **"Save"**.

The key is stored in `localStorage` and never sent to any server except Google's API. `gemini-2.0-flash` is on the **Free Tier**.

---

## Development — التطوير

### Prerequisites

- **Node.js** 20+ (LTS)
- **npm** 10+

### Setup

```bash
git clone https://github.com/waleedmandour/rdat-pwa.git
cd rdat-pwa
npm install
npm run dev
```

### Build

```bash
# Standard build (Vercel / Node.js server) — forces webpack (required by PWA plugin)
npm run build

# GitHub Pages static export (with basePath)
npm run build:ghpages
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Standard Next.js build with webpack (for Vercel) |
| `npm run build:ghpages` | Static export with `/rdat-pwa` basePath |
| `npm run start` | Start Next.js production server |
| `npm run lint` | Run ESLint checks |

---

## Deployment — النشر

### Vercel (Recommended — موصى به)

Vercel provides automatic builds from Git, edge CDN, and native Next.js optimization:

1. Go to [vercel.com](https://vercel.com) → Sign in with GitHub.
2. **Add New Project** → Select `rdat-pwa` → **Deploy**.

Vercel automatically:
- Builds on every push to `main` using `npm install` (configured via `vercel.json`)
- Serves from global edge CDN
- Applies COOP/COEP headers for SharedArrayBuffer (WebGPU + WASM)
- Caches `.wasm` and model shards with immutable headers
- Handles PWA service worker correctly

**Live:** `https://rdat-pwa.vercel.app/`

### GitHub Pages (Static Export)

1. Build: `npm run build:ghpages`
2. Deploy the `out/` directory.

> **Note:** GitHub Pages cannot set COOP/COEP headers, so WebGPU SharedArrayBuffer may not work there. Use Vercel for the full experience.

---

## Project Structure

```
rdat-pwa/
├── .github/workflows/
│   └── ci.yml                  # CI pipeline (lint + build)
├── public/
│   ├── data/
│   │   └── default-corpus-en-ar.json  # EN↔AR parallel corpus (RAG)
│   ├── manifest.json           # PWA manifest
│   ├── favicon.ico
│   ├── logo.svg
│   └── icons/                  # PWA icons (72–512px)
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout (PWA meta, dark theme)
│   │   ├── page.tsx            # Entry point → WorkspaceShell
│   │   └── globals.css         # Tailwind + VS Code dark palette
│   ├── components/
│   │   ├── ErrorBoundary.tsx   # Client-side error recovery UI
│   │   ├── gpu/
│   │   │   ├── GPUStatusIndicator.tsx
│   │   │   └── WebGPUBanner.tsx
│   │   ├── settings/
│   │   │   └── SettingsModal.tsx    # BYOK UI, 4-tab dialog
│   │   ├── ui/                     # shadcn/ui components
│   │   └── workspace/
│   │       ├── Header.tsx           # Top bar (bilingual labels)
│   │       ├── Sidebar.tsx          # Collapsible, translator shortcuts
│   │       ├── StatusBar.tsx        # Bilingual indicators
│   │       ├── MonacoEditor.tsx     # Monaco with Below-The-Line Zone Widget
│   │       ├── WorkspaceShell.tsx   # Main IDE orchestrator
│   │       ├── EditorWelcome.tsx    # Welcome page (Arabic hero)
│   │       ├── TerminologyPanel.tsx # RAG terminology matches display
│   │       ├── AboutDialog.tsx      # About dialog
│   │       └── InstallPWAButton.tsx # PWA install button
│   ├── hooks/
│   │   ├── usePredictiveTranslation.ts  # Predictive Prefetch Engine (v4.0)
│   │   ├── useAMTALinter.ts    # AMTA: markers + CodeActionProvider
│   │   ├── useAppMode.ts       # Mode derivation from GPU
│   │   ├── useEditorEventLoop.ts # Debounce → abort → inference
│   │   ├── useGemini.ts        # Gemini client (localStorage BYOK)
│   │   ├── useGTRBootstrapper.ts # RAG Worker lifecycle + corpus caching
│   │   ├── useServiceWorker.ts # PWA online/offline
│   │   ├── useWebGPU.ts        # SSR-safe WebGPU detection
│   │   ├── useWebLLM.ts        # WebLLM engine + ghost text generation
│   │   └── use-mobile.ts       # Mobile viewport detection
│   ├── lib/
│   │   ├── amta-linter.ts      # Terminology scanner
│   │   ├── asset-url.ts        # basePath-aware URL resolver
│   │   ├── constants.ts        # Config + bilingual UI labels
│   │   ├── gemini-provider.ts  # Client-side Gemini wrapper
│   │   ├── gpu-utils.ts        # GPU info utilities
│   │   ├── prompt-builder.ts   # LLM prompt + RAG fusion (GTR + Zero-Shot)
│   │   ├── rag-types.ts        # RAG TypeScript types
│   │   ├── sentence-extractor.ts  # Source sentence extraction by line
│   │   ├── xml-parser.ts       # XML user guide parser
│   │   └── utils.ts            # General utilities
│   ├── types/index.ts          # Shared TypeScript types
│   └── workers/rag-worker.ts   # RAG Web Worker (Orama + Transformers.js)
├── next.config.ts              # Vercel config (COOP/COEP, WASM, PWA)
├── vercel.json                 # {"installCommand": "npm install"}
├── package.json
└── tsconfig.json
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 16 | React framework, edge optimization |
| **Deployment** | Vercel | Auto-builds, CDN, native Next.js |
| **Language** | TypeScript 5 | Type safety |
| **Styling** | Tailwind CSS 4 | VS Code dark palette |
| **UI Components** | shadcn/ui + Radix | Accessible, composable primitives |
| **Editor** | Monaco Editor | Custom IViewZone widget, markers, CodeActions |
| **Panels** | react-resizable-panels | Split-pane CAT workspace |
| **Local AI** | WebLLM (Gemma 2B INT4) | In-browser GPU inference |
| **Cloud AI** | Google Gemini 2.0 Flash | Client-side rewrite API |
| **Embeddings** | Transformers.js | Browser-based multilingual embeddings |
| **Vector DB** | Orama 3 | In-memory RAG vector store |
| **State** | Zustand | Client-side state management |
| **Animation** | Framer Motion | UI transitions and gestures |
| **PWA** | `@ducanh2912/next-pwa` | Service worker + Workbox |
| **CI** | GitHub Actions | Lint + build validation |

---

## Data Sources & Acknowledgements — مصادر البيانات والشكر

RDAT Copilot incorporates parallel corpora and translation memory data from the following sources, which are used to bootstrap the in-browser RAG vector database and provide terminology context for AI-powered translation suggestions. All data is processed and stored locally in the user's browser — no external API calls are made for corpus retrieval.

### WikiMatrix — ويكيماتريكس

This project uses sentence-aligned parallel corpora from **[WikiMatrix](https://github.com/facebookresearch/LASER/tree/master/tasks/WikiMatrix)** (Schwenk et al., 2019, *Proceedings of the 2019 Conference on Empirical Methods in Natural Language Processing and the 9th International Joint Conference on Natural Language Processing*) as training and translation memory data for the English-Arabic language pair. WikiMatrix provides high-quality, Wikipedia-derived sentence alignments mined across 85+ languages using multilingual sentence embeddings. The English-Arabic subset used in this project is sourced from the [WikiMatrix v1.0 release](https://github.com/facebookresearch/LASER/tree/master/tasks/WikiMatrix) and is used in compliance with the CC-BY-SA 3.0 license governing Wikipedia content. Sentence alignments are converted and loaded into the in-browser Orama vector database for semantic search. We gratefully acknowledge the LASER team at Meta AI for making this invaluable resource freely available to the research community.

### QED Corpus

Additional English-Arabic parallel data is drawn from the **[QED Corpus](https://github.com/qed-project/qed)** (Koehn et al.), a curated collection of TED talk translations and other professionally translated content. This corpus is used to supplement the translation memory with conversational and diplomatic register texts, broadening the domain coverage of the RAG pipeline beyond the legal and technical terms in the primary glossary.

### OPUS Glossary

The primary English-Arabic legal and technical glossary is derived from the **[OPUS](https://opus.nlpl.eu/)** open parallel corpus project. OPUS aggregates translation data from a wide range of public sources including EU proceedings, UN documents, and OpenSubtitles. The glossary subset used here focuses on legal, diplomatic, and technical terminology relevant to formal translation registers.

---

## License

MIT — See [LICENSE](LICENSE) for details.

---

<div align="center">
<strong>Dr. Waleed Mandour</strong> · Sultan Qaboos University · جامعة السلطان قابوس
📧 [w.abumandour@squ.edu.om](mailto:w.abumandour@squ.edu.om)

Powered by WebGPU · WebLLM · Transformers.js · Orama · Google Gemini · Monaco Editor
</div>
