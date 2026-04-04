---
Task ID: 1
Agent: Main Orchestrator
Task: 6 tasks for RDAT-Copilot PWA — XML parser, WikiMatrix citation, autosave, default text, clear workspace, GitHub push

Work Log:
- Cloned existing repo from https://github.com/waleedmandour/rdat-pwa
- Analyzed full codebase: 50+ source files, Next.js 16 + Monaco Editor + WebGPU
- Read all key files: WorkspaceShell.tsx, Header.tsx, MonacoEditor.tsx, constants.ts, rag-types.ts, README.md, layout.tsx
- Created src/lib/xml-parser.ts: Flexible XML parser using DOMParser
  - Supports TMX (tu/tuv/seg structure), XLIFF 1.x (trans-unit), XLIFF 2.x (unit/segment), custom XML
  - Handles language code variants (en, eng, ar, ara, en-US, ar-SA)
  - 5000-entry slice limit (XML_PARSER_MAX_ENTRIES) with sliced flag
  - Output format: { id, type: 'translation_memory', en, ar }
  - parseXML() for strings, parseXMLFile() for File objects
  - Auto-detects format from root element
- Added WikiMatrix citation to README.md under new "Data Sources & Acknowledgements" section
  - Full academic reference: Schwenk et al., 2019, EMNLP-IJCNLP
  - Links to WikiMatrix v1.0 on GitHub and LASER project
  - Also cited QED Corpus and OPUS Glossary
  - Updated Table of Contents
- Updated src/lib/constants.ts with:
  - WORKSPACE_AUTOSAVE_KEY and WORKSPACE_AUTOSAVE_DEBOUNCE_MS (2000ms)
  - DEFAULT_SOURCE_TEXT_EN: Great Pyramid of Giza encyclopedic text (5 paragraphs)
  - DEFAULT_TARGET_TEXT_AR: Partial Arabic translation (2 paragraphs)
  - DEFAULT_SOURCE_TEXT_AR: Arabic source text for AR→EN mode
- Updated src/components/workspace/WorkspaceShell.tsx:
  - Autosave: debounced 2s localStorage persistence of sourceText + targetText + langDirection + timestamp
  - Auto-restore from localStorage on page load
  - Clear workspace handler: resets both panes to defaults, removes autosave
  - Uses imported default texts from constants.ts
  - Passed onClearWorkspace prop to Header
- Updated src/components/workspace/Header.tsx:
  - Added Clear Workspace button (Trash2 icon) in header right section
  - Bilingual AlertDialog confirmation dialog (English + Arabic)
  - Red-themed destructive action styling
  - Uses shadcn/ui AlertDialog components
- Updated src/app/layout.tsx:
  - Added Toaster component (sonner) for toast notifications
  - Position: bottom-right, richColors, closeButton enabled
- Build verified: zero errors, ESLint clean (all 4 modified files)
- Committed as 6329bab

Stage Summary:
- New file: src/lib/xml-parser.ts (310 lines) — TMX/XLIFF/Custom XML parser
- Modified: README.md — WikiMatrix + QED + OPUS citations
- Modified: src/lib/constants.ts — autosave keys + Great Pyramid default texts
- Modified: src/components/workspace/WorkspaceShell.tsx — autosave + clear + new defaults
- Modified: src/components/workspace/Header.tsx — trash icon + confirmation dialog
- Modified: src/app/layout.tsx — Toaster component
- GitHub push: FAILED — no authentication credentials in this environment
  - User must run: cd rdat-pwa && git push origin main
  - Commit 6329bab is ready locally with all 6 changes
