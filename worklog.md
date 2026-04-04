---
Task ID: 1
Agent: Main Orchestrator
Task: Architectural pivot to split-pane CAT workspace with source-driven RAG

Work Log:
- Read and analyzed entire codebase: 50+ files, 7 layers of architecture
- Identified all files requiring modification for the pivot
- Implemented `getSourceLine()` and `getSourceSentence()` in sentence-extractor.ts
- Updated `buildMessages()` in prompt-builder.ts to accept sourceSentence parameter with structured 4-section format
- Updated system prompts in constants.ts to describe split-pane CAT context
- Updated Gemini system prompts for source-aware rewriting
- Updated `rewriteText()` in gemini-provider.ts to accept and include sourceText
- Updated `useGemini.ts` rewrite signature to pass through sourceText
- Rewrote MonacoEditor.tsx with: readOnly prop, enableCompletions prop, separate languageIds (rdat-source/rdat-target), cursor position tracking callback
- Rewrote WorkspaceShell.tsx with react-resizable-panels split-pane layout, source/target state management, source editing overlay, cursor line tracking, source-driven RAG, source-aware Gemini rewrites
- Fixed all ESLint errors (ref-during-render, setState-in-effect, variable ordering)
- Updated README.md: new Mermaid diagram, architecture layers, split-pane CAT section, ghost text sources table
- Build verified: compiled successfully, lint clean, no errors

Stage Summary:
- Split-pane workspace implemented with resizable panels (38/62 default split)
- Source pane: readOnly Monaco with Edit overlay for pasting
- Target pane: active editor with ghost text, AMTA linting, cursor tracking
- RAG pipeline now searches on SOURCE text (line-matched from target cursor)
- LLM prompts include: Source Sentence + TM + Target Draft + Instruction
- Gemini rewrites receive source + target for accuracy evaluation
- All changes build error-free and lint clean
- README updated with comprehensive architecture documentation
---
Task ID: 1
Agent: Main Agent
Task: Fix logo, verify translations, review project, push to GitHub

Work Log:
- Identified that logo.svg contained a Z-shaped letter instead of R
- Redesigned logo.svg with proper R letter: vertical stem, D-shaped bowl, diagonal leg
- Regenerated all 8 PWA icon PNGs (72-512px) and favicon.ico from the new R logo SVG
- Verified all Arabic translations were already correct in constants.ts:
  - UI_LABELS.sovereignTrack.ar = "مسار التحكم (علي الجهاز)" ✓
  - WEBLLM_STATE_LABELS_AR = "ذكاء اصطناعي مثبت علي الجهاز" ✓
  - MODE_LABELS_AR.local = "مسار التحكم (علي الجهاز)" ✓
- Confirmed Gemini API key input already fully implemented in Sidebar.tsx with save/remove/link
- Ran full project structure review (54+ files) — found and fixed:
  - Export EditorView type from WorkspaceShell.tsx
  - Remove unused Copy import from lucide-react
- Build successful with no errors
- Pushed to GitHub: 84874d1

Stage Summary:
- Logo changed from Z to R shape across all 11 files
- No missing components found — project is architecturally complete for Phase 8
- All changes pushed to https://github.com/waleedmandour/rdat-pwa.git
---
Task ID: 2
Agent: UI/UX Fix Agent
Task: Implement 4 UI/UX fixes — AMTA linter punctuation, cross-editor highlighting, terminology panel, status bar arrow

### Work Summary

**FIX 1: AMTA Linter Punctuation Bug** (`src/lib/amta-linter.ts`)
- Added `sanitizeText()` function that replaces 16 smart/curly quote characters and invisible Unicode chars (zero-width spaces, non-joiners, BOM, CJK brackets) with standard ASCII equivalents
- Added `isWholeWordMatch(line, idx, termLength)` helper that checks both left and right boundaries of a match against `[a-zA-Z0-9\u0600-\u06FF]` (Latin + Arabic alphanumerics), preventing false positives from substring matches
- Updated `lintText()` to sanitize both the search term and each line before matching, then use `isWholeWordMatch()` to validate matches
- Added `findOriginalTermIndex()` to map sanitized match positions back to original line positions for accurate Monaco column reporting
- Context check (`hasTranslation`) also uses sanitized text for consistent matching
- Preserved `AMTA_MIN_TERM_LENGTH` filter and `direction` parameter behavior

**FIX 2: Active Sentence Tracking** (`src/components/workspace/MonacoEditor.tsx`)
- Added `highlightLine?: number` prop to `MonacoEditorProps`
- Added `monacoRef` to store Monaco instance for decoration API access
- Added `highlightDecorationsRef` to track decoration IDs for cleanup
- Added `injectHighlightStyle()` function that injects a `<style>` tag with `.rdat-source-highlight { background: rgba(45, 212, 191, 0.08) !important; }` (runs once via module-level guard)
- Added `useEffect` watching `highlightLine` that uses `editor.deltaDecorations()` with `isWholeLine: true`, `className: 'rdat-source-highlight'`, and an overview ruler color `#2dd4bf` in Full lane
- In `WorkspaceShell.tsx`: passed `highlightLine={activeTargetLine}` to the Source MonacoEditor

**FIX 3: Terminology Matches (RAG) Panel** (`src/components/workspace/TerminologyPanel.tsx`)
- Created new component with bilingual header: "Terminology Matches / تطابق المصطلحات"
- Collapsible via chevron button (ChevronDown/ChevronRight), default open
- Match count shown as teal badge in header
- Results rendered as compact rows: index → EN term → AR term → similarity badge
- Similarity badges color-coded: ≥80% emerald, ≥60% amber, else dim
- Max height 180px with scrollable overflow and thin custom scrollbar
- Empty state: "No matches for current sentence / لا توجد تطابقات" with MessageSquareDashed icon
- Hidden entirely when RAG state is "idle"
- Integrated into WorkspaceShell.tsx below the source MonacoEditor, within the source Panel's flex-column layout

**FIX 4: Status Bar Language Direction Arrow** (`src/components/workspace/StatusBar.tsx`)
- Changed line 190 from `←` (backwards) to `→` (correct translation direction)
- Now displays "EN → AR" instead of "EN ← AR"

All changes pass ESLint with zero errors.
---
Task ID: 1
Agent: Main Agent
Task: Research GTR glossary databases online and embed corpus in RDAT-Copilot

Work Log:
- Searched 15+ web sources for EN-AR geopolitical glossary databases
- Deep-dived into: UNTERM (UN), HuggingFace Tatoeba-EN-AR (30,853 pairs), OPUS corpus, TTMEM, Desert-Sky vocabulary, ICNC glossary, ILOTERM
- Scraped full HTML tables from arabic.desert-sky.net/m_govt.html (~200 geopolitical EN-AR term pairs)
- Evaluated sources by embeddability for client-side PWA (size, licensing, format)
- Created public/data/default-corpus-en-ar.json with 180 entries (160 terminology + 20 translation memory)
- Organized across 8 domains: government, diplomacy, elections, law, human rights, ideology, military, legal
- 83 strict AMTA-enforced terms for quality linting
- Bumped CORPUS_CACHE_VERSION from v1 to v2
- Verified build succeeded (Next.js 16 Turbopack - zero errors)
- Pushed to GitHub as commit b714249

Stage Summary:
- UNTERM and OPUS not directly embeddable (too large for client-side PWA)
- Desert-Sky vocabulary identified as primary source (free, accurate, comprehensive)
- HuggingFace Tatoeba-EN-AR (CC-BY-2.0) is best TM source if larger corpus needed later
- UNTERM Country Names EN-AR (Excel download) could supplement as future enhancement
- All infrastructure (useGTRBootstrapper, rag-worker, TerminologyPanel) was already built
- Sidebar was already clean (no Phase text found)
