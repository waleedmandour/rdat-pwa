---
Task ID: 1
Agent: Main Agent
Task: Fix 3 critical bugs in rdat-pwa: Monaco Editor typing, WebGPU state, model caching

Work Log:
- Analyzed uploaded screenshot showing "WebGPU N/A" status and empty target editor
- Read all key source files: TargetEditor.tsx, SourceEditor.tsx, useWebLLM.ts, StatusBar.tsx, TranslationWorkspace.tsx, AiModelsView.tsx, monaco-suggestion-provider.ts, settings-store.ts, workspace-store.ts
- Diagnosed root cause #1: TargetEditor cleanup useEffect had [webLLM, gemini] dependencies - these are new objects every render, causing ghost provider disposal on every re-render
- Diagnosed root cause #2: useWebLLM stayed in "unavailable" state even when WebGPU adapter was found, creating chicken-and-egg problem with ghost text provider
- Diagnosed root cause #3: No hasModelInCache() check before creating engine, leading to potential re-downloading
- Also found: global Tab key handler without context gate was shadowing normal Tab behavior

Stage Summary:
- Fixed TargetEditor.tsx: changed cleanup deps from [webLLM, gemini] to [], use refs for cleanup, removed global Tab handler
- Fixed useWebLLM.ts: added "idle" state for WebGPU available but model not loaded, added isWebGPUAvailable flag, added hasModelInCache() check, changed ghost text provider check from isReady to isWebGPUAvailable
- Fixed StatusBar.tsx: added "idle" to WebGPUState type, added display config for idle state ("WebGPU Available")
- Fixed AiModelsView.tsx: now uses useWebLLM() hook for real-time WebLLM state, shows model name and download progress
- All 72 tests passing, 0 TypeScript errors
- Pushed to GitHub: commit 060c58d
