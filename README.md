<div align="center">

# RDAT Copilot

**مساعد الترجمة الذكي — Repository-Driven Adaptive Translation**

[![CI](https://github.com/waleedmandour/rdat-pwa/actions/workflows/ci.yml/badge.svg)](https://github.com/waleedmandour/rdat-pwa/actions/workflows/ci.yml)
[![Deploy on Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/waleedmandour/rdat-pwa)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Progressive Web App that provides a full-featured, AI-powered co-writing environment for English-Arabic translation — running entirely in the browser. Built on a dual-track AI architecture that combines a Sovereign Track (local WebGPU inference via Gemma) and a Reasoning Track (cloud Gemini API). All translation decisions are guided by an in-browser RAG vector database and an AMTA terminology linter.

</div>

---

## Author & Affiliation

**Dr. Waleed Mandour**
Sultan Qaboos University (جامعة السلطان قابوس)

RDAT Copilot is a research-informed translation technology tool designed for professional translators working between English and Arabic. It embodies a non-destructive editing philosophy — AI never overwrites the translator's text — and provides intelligent, context-aware suggestions that respect the translator's creative authority.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Dual-Track AI System](#dual-track-ai-system)
  - [Sovereign Track — المسار السيادي (Local WebGPU)](#sovereign-track--المسار-السيادي-local-webgpu)
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
- [License](#license)

---

## Architecture Overview

RDAT Copilot is a client-side Progressive Web App built with Next.js 16, Monaco Editor, and WebGPU. It runs entirely in the browser — no backend server required for core functionality. The architecture follows a **non-destructive editing philosophy**: AI never overwrites the translator's text. Ghost text appears as inline suggestions (press Tab to accept), and heavier cloud rewrites are presented in an approval panel.

The system is organized into five functional layers:

1. **Editor Layer — طبقة المحرر** — Monaco Editor with RTL support, syntax-aware inline completions, and a custom `rdat-translation` language ID.
2. **Event Loop Layer — طبقة الأحداث** — A debounced keystroke handler with AbortController lifecycle. Every keystroke resets a 300ms debounce; when it fires, RAG retrieval and AMTA linting run in parallel. If inference is active on a new keystroke, `interruptGenerate()` cancels immediately.
3. **RAG Layer — طبقة البحث الدلالي** — An Orama vector database in a dedicated Web Worker. Embeddings via Transformers.js (with deterministic hash fallback). Semantic search returns the top 3 translation memory matches in under 50ms.
4. **AI Layer — طبقة الذكاء الاصطناعي** — Dual-track: Sovereign (local Gemma via WebGPU for real-time ghost text) + Reasoning (Gemini from the browser for rewriting).
5. **Linting Layer — طبقة الفحص** — The AMTA linter scans for untranslated English legal terms, draws yellow squiggles, and offers Ctrl+. autocorrections.

---

## Dual-Track AI System

### Sovereign Track — المسار السيادي (Local WebGPU)

The Sovereign Track runs a quantized Gemma 2B model entirely in the browser using [WebLLM](https://github.com/mlc-ai/web-llm). This provides real-time ghost text — short inline completion suggestions (3–15 words) that appear as you type.

**How it works:**

1. When the debounce timer fires after a keystroke, the event loop extracts the current sentence from the editor text.
2. The sentence is truncated for embedding safety and sent to the RAG Web Worker for semantic search.
3. The top 3 RAG results (English→Arabic translation pairs) are injected into a system prompt constraining the LLM to output only ghost text completions.
4. The prompt is sent to the WebLLM engine running Gemma 2B (INT4 quantized) via WebGPU.
5. Generated text appears as a ghost text suggestion — the translator presses Tab to accept or continues typing to dismiss.

**Latency Trap Prevention — منع اختبار الكمون:**

Every keystroke while inference is running fires `engine.interruptGenerate()` through a two-layer cancellation system: Monaco's `CancellationToken` and a custom `AbortController`. Stale completions never appear and the GPU is freed immediately.

**Gemma 4 Roadmap — خارطة طريق جيما 4:**

RDAT Copilot targets the [Gemma 4](https://deepmind.google/models/gemma/gemma-4/) model family by Google DeepMind for the Sovereign Track. The current release uses Gemma 2B (INT4 quantized) as the most performant model available in the WebLLM framework. Integration of Gemma 4 will be enabled as soon as WebLLM releases compatible model weights, delivering significantly enhanced translation quality for the local inference path.

### Reasoning Track — مسار الاستدلال (Cloud Gemini)

The Reasoning Track uses Google's Gemini API for heavier tasks requiring more reasoning capacity than the local 2B model.

**How it works:**

1. The translator selects text in the editor and clicks "✨ Rewrite" (إعادة صياغة).
2. The selected text, along with RAG context, is sent to Gemini directly from the browser.
3. Gemini generates a rewritten version matching formal legal register in Arabic.
4. Results appear in a side panel — the translator clicks "Accept" (قبول) or "Dismiss" (رفض).

**BYOK Architecture — أدخل مفتاحك الخاص:**

The Gemini API key is stored in the browser's `localStorage` and never sent to any server other than Google's. Each user provides their own key through Settings. `gemini-3.1-flash-lite-preview` is the current Free Tier model — zero cost for the developer, budget-friendly for all users.

### Track Comparison — مقارنة المسارين

| Aspect | Sovereign Track — المسار السيادي | Reasoning Track — مسار الاستدلال |
|--------|----------------|-----------------|
| **Purpose** | Ghost text suggestions | Heavy rewriting and synthesis |
| **Model** | Gemma 2B (INT4, local) | Gemini 3.1 Flash Lite (cloud) |
| **Trigger** | Automatic on keystroke (debounced) | Manual: select + click Rewrite |
| **Output** | 3–15 word inline ghost text | Full passage in side panel |
| **UI** | Tab to accept | Accept/Dismiss panel |
| **Latency** | Target: <200ms | ~1–3s |
| **Network** | Offline after model download | Requires internet |
| **API Key** | None needed | User-provided (BYOK) |

---

## RAG Pipeline — محرك البحث الدلالي

The Retrieval-Augmented Generation pipeline provides translation memory context for both AI tracks, running entirely in a Web Worker.

**Components:**

- **Orama Vector Database** — In-memory store with 384-dimensional embeddings and cosine similarity search.
- **Transformers.js** — `paraphrase-multilingual-MiniLM-L12-v2` for real semantic embeddings. Falls back to deterministic hash-based pseudo-embeddings on failure.
- **Corpus** — JSON glossary of English→Arabic legal/technical term pairs (`opus-glossary-en-ar.json`).

**Flow:**

1. On startup, the worker fetches the corpus, generates embeddings, and indexes them in Orama.
2. On typing (debounced), the current sentence is embedded and vector-searched.
3. Top 3 matches with scores and timing are returned and injected into the LLM prompt.

**Performance:** Vector search < 50ms (verified with ✓/⚠ console indicator).

---

## AMTA Terminology Linter — فحص جودة الترجمة

The AMTA linter scans the editor for untranslated English legal terms from the glossary corpus.

**How it works:**

1. After the editor debounce settles (2-second delay), the linter scans the full editor text.
2. For each English term in the glossary, it performs a case-insensitive search.
3. If an English term is found but the Arabic translation is not present nearby, a lint issue is created.
4. Issues appear as **yellow squiggly warnings** via Monaco's `setModelMarkers`.
5. A **CodeActionProvider** enables **Ctrl+.** quick fixes: `AMTA: Replace "Force Majeure" → "القوة القاهرة"`.

---

## Bilingual Interface — واجهة ثنائية اللغة

RDAT Copilot features a fully bilingual Arabic-English interface, designed for professional translators who work between English and Arabic. Following the design language of [Gemma 4](https://deepmind.google/models/gemma/gemma-4/), every UI element displays an Arabic subtitle followed by its English description:

- **Header**: "مساعد الترجمة الذكي" — Intelligent Translation Assistant
- **Sidebar**: All menu items include Arabic labels (محرر الترجمة, مسرد المصطلحات, نماذج الذكاء الاصطناعي)
- **Status Bar**: Bilingual mode indicators (سيادي / سحابي / هجين)
- **Settings**: Arabic section headers (عام, اللغات, مفاتيح API, نماذج الذكاء الاصطناعي)
- **Welcome Page**: Arabic hero title "مرحبًا بك في RDAT Copilot" with Quick Start cards
- **Ghost Text Hint**: "اضغط Tab لقبول · نص مقترح" — Press Tab to accept

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

The key is stored in `localStorage` and never sent to any server except Google's API. `gemini-3.1-flash-lite-preview` is on the **Free Tier**.

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
# Standard build (Vercel / Node.js server)
npm run build

# GitHub Pages static export (with basePath)
npm run build:ghpages
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Standard Next.js build (for Vercel) |
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
- Builds on every push to `main`
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
│   ├── manifest.json           # PWA manifest
│   ├── opus-glossary-en-ar.json # EN-AR legal/technical glossary
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
│   │   └── workspace/
│   │       ├── Header.tsx           # Top bar (bilingual labels)
│   │       ├── Sidebar.tsx          # Collapsible, translator shortcuts
│   │       ├── StatusBar.tsx        # Bilingual indicators
│   │       ├── MonacoEditor.tsx     # Monaco with inline completions
│   │       ├── WorkspaceShell.tsx   # Main IDE orchestrator
│   │       └── EditorWelcome.tsx    # Welcome page (Arabic hero)
│   ├── hooks/
│   │   ├── useAMTALinter.ts    # AMTA: markers + CodeActionProvider
│   │   ├── useAppMode.ts       # Mode derivation from GPU
│   │   ├── useEditorEventLoop.ts # Debounce → abort → inference
│   │   ├── useGemini.ts        # Gemini client (localStorage BYOK)
│   │   ├── useRAG.ts           # RAG Worker lifecycle
│   │   ├── useServiceWorker.ts # PWA online/offline
│   │   ├── useWebGPU.ts        # SSR-safe WebGPU detection
│   │   └── useWebLLM.ts        # WebLLM engine + ghost text
│   ├── lib/
│   │   ├── amta-linter.ts      # Terminology scanner
│   │   ├── asset-url.ts        # basePath-aware URL resolver
│   │   ├── constants.ts        # Config + bilingual UI labels
│   │   ├── gemini-provider.ts  # Client-side Gemini wrapper
│   │   ├── gpu-utils.ts        # GPU info utilities
│   │   ├── prompt-builder.ts   # LLM prompt + RAG fusion
│   │   ├── rag-types.ts        # RAG TypeScript types
│   │   ├── sentence-extractor.ts
│   │   └── utils.ts
│   ├── types/index.ts
│   └── workers/rag-worker.ts   # RAG Web Worker
├── next.config.ts              # Vercel config (COOP/COEP, WASM)
├── vercel.json                 # Routing + cache headers
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
| **Editor** | Monaco Editor | Inline completions, markers |
| **Local AI** | WebLLM (Gemma 2B INT4) | In-browser GPU inference |
| **Cloud AI** | Google Gemini (Flash Lite) | Client-side rewrite API |
| **Embeddings** | Transformers.js | Browser-based embeddings |
| **Vector DB** | Orama | In-memory RAG vector store |
| **PWA** | `@ducanh2912/next-pwa` | Service worker + Workbox |
| **CI** | GitHub Actions | Lint + build validation |

---

## License

MIT — See [LICENSE](LICENSE) for details.

---

<div align="center">
<strong>Dr. Waleed Mandour</strong> · Sultan Qaboos University · جامعة السلطان قابوس

Powered by WebGPU, Transformers.js, Orama, and Google Gemini
</div>
