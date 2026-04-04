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
