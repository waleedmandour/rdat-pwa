"use client";

import React, { useRef, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import type { editor, languages, IDisposable } from "monaco-editor";
import type * as Monaco from "monaco-editor";
import { cn } from "@/lib/utils";
import { getLTE } from "@/lib/local-translation-engine";
import { usePrefetchStore } from "@/stores/prefetch-store";
import { useWebLLM } from "@/hooks/useWebLLM";
import { useGemini } from "@/hooks/useGemini";
import { useRAG } from "@/hooks/useRAG";
import { MonacoSuggestionProvider } from "@/lib/monaco-suggestion-provider";
import { useTheme } from "next-themes";
import type { WebGPUInfo } from "@/components/StatusBar";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

interface TargetEditorProps {
  value?: string;
  onChange?: (value: string | undefined) => void;
  onCursorChange?: (lineNumber: number) => void;
  sourceLines?: string[];
  onWebgpuStateChange?: (state: WebGPUInfo) => void;
  onGeminiAvailableChange?: (available: boolean) => void;
  onRagStateChange?: (state: import("@/hooks/useRAG").RAGState) => void;
  className?: string;
  direction?: "ltr" | "rtl";
}

const BASE_EDITOR_OPTIONS = {
  readOnly: false,
  minimap: { enabled: false },
  lineNumbers: "on" as const,
  wordWrap: "on" as const,
  fontSize: 14,
  lineDecorationsWidth: 4,
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: false,
  renderLineHighlight: "all" as const,
  renderLineHighlightOnlyWhenFocus: true,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 16, bottom: 16 },
  bracketPairColorization: { enabled: false },
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  autoClosingBrackets: "always" as const,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  suggest: { preview: false },
  tabCompletion: "on" as const,
  inlineSuggest: {
    enabled: true,
  },
};

const IDLE_TRIGGER_DELAY_MS = 350;

function calculateGhostTextRange(
  monaco: typeof import("monaco-editor"),
  position: { lineNumber: number; column: number }
): Monaco.Range {
  return new monaco.Range(
    position.lineNumber,
    position.column,
    position.lineNumber,
    position.column
  );
}

function registerGhostTextProvider(
  monaco: typeof import("monaco-editor"),
  sourceLinesRef: React.MutableRefObject<string[]>,
  webLLMRef: React.MutableRefObject<ReturnType<typeof useWebLLM>>,
  geminiRef: React.MutableRefObject<ReturnType<typeof useGemini>>,
  ragRef: React.MutableRefObject<ReturnType<typeof useRAG>>,
  suggestionProvider: MonacoSuggestionProvider,
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
): IDisposable {
  const languageId = "plaintext";
  let contentVersion = 0;

  const providerDisposable = monaco.languages.registerInlineCompletionsProvider(
    languageId,
    {
      provideInlineCompletions: async (model, position) => {
        try {
          const currentVersion = ++contentVersion;
          const lineText = model.getLineContent(position.lineNumber);
          const prefix = lineText.substring(0, position.column - 1).trim();

          const sourceLines = sourceLinesRef.current;
          const sourceLine = sourceLines[position.lineNumber - 1]?.trim() ?? "";

          const isMeaningfulSuggestion = (insertText: string): boolean => {
            const trimmedText = insertText.trim();
            if (!trimmedText) return false;
            if (trimmedText === prefix) return false;
            return true;
          };

          // Empty source line: try prefetch cache
          if (!sourceLine) {
            const { getPrefetch: getPF } = usePrefetchStore.getState();
            const cached = getPF(position.lineNumber);
            if (cached?.translation.trim()) {
              const range = calculateGhostTextRange(monaco, position);
              const cachedRemainder = computeCachedRemainder(cached.translation, prefix);
              if (isMeaningfulSuggestion(cachedRemainder)) {
                return {
                  items: [{ insertText: cachedRemainder, range }],
                };
              }
            }
            return { items: [] };
          }

          const range = calculateGhostTextRange(monaco, position);

          // Immediate LTE
          const lte = getLTE();
          const lteResult = lte.getSuggestion(sourceLine, prefix);
          const items: languages.InlineCompletion[] = [];
          const lteRemainder = lteResult?.remainder?.trim() || "";
          if (lteRemainder && lteRemainder !== prefix) {
            items.push({ insertText: lteRemainder, range });
          }

          // Prefetch cache
          const { getPrefetch } = usePrefetchStore.getState();
          const cached = getPrefetch(position.lineNumber);
          if (cached?.translation.trim()) {
            const cachedRemainder = computeCachedRemainder(cached.translation, prefix);
            if (isMeaningfulSuggestion(cachedRemainder) && !lteRemainder) {
              items.push({ insertText: cachedRemainder, range });
            }
          }

          // Avoid unnecessary async calls when user already typed the full translation
          if (items.length === 0 && prefix.length > 0) {
            const lteFull = lteResult?.match;
            if (lteFull && prefix === lteFull.trim()) return { items: [] };
            if (cached?.translation && prefix === cached.translation.trim())
              return { items: [] };
          }

          // Async pipeline (non‑blocking)
          suggestionProvider.cancelPending();
          suggestionProvider
            .getSuggestions(sourceLine, prefix, {
              lte: async () => lteRemainder,
              rag: async () => {
                const ragState = ragRef.current;
                if (!ragState.state.isCorpusLoaded) return "";
                try {
                  const hits = await ragState.search(sourceLine, 1);
                  if (hits.length > 0 && hits[0].ar) {
                    const remainder = computeCachedRemainder(hits[0].ar, prefix);
                    return isMeaningfulSuggestion(remainder) ? remainder : "";
                  }
                } catch { /* skip */ }
                return "";
              },
              prefetch: async () => {
                if (!cached) return "";
                const remainder = computeCachedRemainder(cached.translation, prefix);
                return isMeaningfulSuggestion(remainder) ? remainder : "";
              },
              webllm: async () => {
                const wllm = webLLMRef.current;
                if (!wllm.isReady) return "";
                try {
                  const result = await wllm.generateBurst(sourceLine, prefix);
                  if (result.text && !result.aborted) {
                    const trimmed = result.text.trim();
                    return trimmed && trimmed !== prefix ? trimmed : "";
                  }
                } catch { /* skip */ }
                return "";
              },
              gemini: async () => {
                const gem = geminiRef.current;
                if (!gem.isAvailable) return "";
                try {
                  const result = await gem.generateBurst(sourceLine, prefix);
                  if (result.text) {
                    const trimmed = result.text.trim();
                    return trimmed && trimmed !== prefix ? trimmed : "";
                  }
                } catch { /* skip */ }
                return "";
              },
            })
            .then((suggestions) => {
              if (contentVersion - currentVersion > 1) return;
              if (suggestions.length === 0) return;
              const bestNew = suggestions.find(
                (s) =>
                  s.source !== "lte" &&
                  s.text.trim() &&
                  s.text.trim() !== prefix &&
                  (!lteRemainder || s.text !== lteRemainder)
              );
              if (bestNew) triggerInlineSuggest(editorRef.current);
            })
            .catch((err) => console.warn("[RDAT Ghost] Async pipeline error:", err));

          return { items };
        } catch (err) {
          console.error("[RDAT Ghost] provideInlineCompletions error:", err);
          return { items: [] };
        }
      },
      disposeInlineCompletions: () => {},
    }
  );

  return providerDisposable;
}

function computeCachedRemainder(fullTranslation: string, typedPrefix: string): string {
  const trimmed = fullTranslation.trim();
  const prefix = typedPrefix.trim();
  if (!prefix) return trimmed;
  if (trimmed.startsWith(prefix)) {
    const remainder = trimmed.substring(prefix.length).trimStart();
    return remainder;
  }
  return "";
}

function triggerInlineSuggest(editor: editor.IStandaloneCodeEditor | null): void {
  if (!editor) return;
  try {
    editor.trigger("rdat-ghost-text", "editor.action.inlineSuggest.trigger", {});
  } catch { /* editor may be in a temporary state */ }
}

export function TargetEditor({
  value = "",
  onChange,
  onCursorChange,
  sourceLines = [],
  onWebgpuStateChange,
  onGeminiAvailableChange,
  onRagStateChange,
  className,
  direction = "rtl",
}: TargetEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const ghostProviderRef = useRef<IDisposable | null>(null);
  const suggestionProviderRef = useRef<MonacoSuggestionProvider | null>(null);
  const sourceLinesRef = useRef<string[]>(sourceLines);
  useEffect(() => { sourceLinesRef.current = sourceLines; }, [sourceLines]);

  // Store initial value for defaultValue (only changes on segment switch)
  const initialValueRef = useRef(value);
  // Track external value changes to sync only when not from user typing
  const prevExternalValueRef = useRef(value);
  // Flag to ignore user‑initiated changes when syncing from prop
  const isUserEditRef = useRef(false);

  const webLLM = useWebLLM();
  const gemini = useGemini();
  const rag = useRAG();
  const webLLMRef = useRef(webLLM);
  const geminiRef = useRef(gemini);
  const ragRef = useRef(rag);
  useEffect(() => { webLLMRef.current = webLLM; }, [webLLM]);
  useEffect(() => { geminiRef.current = gemini; }, [gemini]);
  useEffect(() => { ragRef.current = rag; }, [rag]);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Stable callbacks stored in refs to avoid stale closures
  const onCursorChangeRef = useRef(onCursorChange);
  useEffect(() => { onCursorChangeRef.current = onCursorChange; }, [onCursorChange]);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const onWebgpuStateChangeRef = useRef(onWebgpuStateChange);
  useEffect(() => { onWebgpuStateChangeRef.current = onWebgpuStateChange; }, [onWebgpuStateChange]);
  const onGeminiAvailableChangeRef = useRef(onGeminiAvailableChange);
  useEffect(() => { onGeminiAvailableChangeRef.current = onGeminiAvailableChange; }, [onGeminiAvailableChange]);
  const onRagStateChangeRef = useRef(onRagStateChange);
  useEffect(() => { onRagStateChangeRef.current = onRagStateChange; }, [onRagStateChange]);

  // Report hook states
  useEffect(() => {
    onWebgpuStateChangeRef.current?.({
      state: webLLM.state as WebGPUInfo["state"],
      progress: webLLM.progress.percentage > 0 ? webLLM.progress : undefined,
      error: webLLM.error,
    });
  }, [webLLM.state, webLLM.progress, webLLM.error]);
  useEffect(() => {
    onGeminiAvailableChangeRef.current?.(gemini.isAvailable);
  }, [gemini.isAvailable]);
  useEffect(() => {
    onRagStateChangeRef.current?.(rag.state);
  }, [rag.state]);

  const fontFamily = useMemo(
    () =>
      direction === "rtl"
        ? "'Noto Sans Arabic', 'JetBrains Mono', 'Fira Code', monospace"
        : "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    [direction]
  );

  const editorOptions = useMemo(
    () => ({ ...BASE_EDITOR_OPTIONS, fontFamily }),
    [fontFamily]
  );

  // ──────────────────────────────────────────────────────────────
  // Sync editor content with external `value` prop (segment changes)
  // only when it comes from outside and not from user typing.
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    // If the editor is currently composing (IME), do nothing
    if (editor.getOption(monacoRef.current?.editor?.EditorOption?.inComposition ?? 0)) return;

    // If the latest change was user‑typed, do not overwrite
    if (isUserEditRef.current) {
      isUserEditRef.current = false;
      return;
    }

    // Only apply when value actually differs from editor content
    const currentEditorValue = editor.getValue();
    if (value !== currentEditorValue) {
      editor.setValue(value);
      prevExternalValueRef.current = value;
    }
  }, [value]);

  // Update theme & font on the fly
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (editor && monaco) {
      editor.updateOptions({
        theme: isDark ? "rdat-dark" : "rdat-light",
        fontFamily,
      });
    }
  }, [isDark, fontFamily]);

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Ensure it's always writable
      editor.updateOptions({ readOnly: false });

      // Define themes
      monaco.editor.defineTheme("rdat-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [],
        colors: { "editor.inlineSuggest.foreground": "#64748b" },
      });
      monaco.editor.defineTheme("rdat-light", {
        base: "vs",
        inherit: true,
        rules: [],
        colors: { "editor.inlineSuggest.foreground": "#94a3b8" },
      });

      // Initialize suggestion provider
      if (!suggestionProviderRef.current) {
        suggestionProviderRef.current = new MonacoSuggestionProvider();
      }
      if (ghostProviderRef.current) {
        ghostProviderRef.current.dispose();
      }
      ghostProviderRef.current = registerGhostTextProvider(
        monaco,
        sourceLinesRef,
        webLLMRef,
        geminiRef,
        ragRef,
        suggestionProviderRef.current,
        editorRef
      );

      // Initial ghost text trigger
      setTimeout(() => triggerInlineSuggest(editor), 500);

      editor.onDidFocusEditorWidget(() => {
        setTimeout(() => triggerInlineSuggest(editor), 300);
      });

      // Word‑by‑word acceptance
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.RightArrow,
        () => editor.trigger("keyboard", "editor.action.inlineSuggest.acceptNextWord", {})
      );

      // Tab: accept full suggestion
      editor.addCommand(
        monaco.KeyCode.Tab,
        () => editor.trigger("keyboard", "editor.action.inlineSuggest.commit", {}),
        "editorInlineSuggestionVisible"
      );

      // ── User typing event ──────────────────────────────
      editor.onDidChangeModelContent(() => {
        // Mark that the change originated from user input
        isUserEditRef.current = true;

        // Report value to parent (uncontrolled, but we still propagate)
        const newValue = editor.getValue();
        onChangeRef.current?.(newValue);

        // Interrupt AI generation
        webLLMRef.current.interruptGenerate();
        geminiRef.current.interruptGenerate();
        suggestionProviderRef.current?.cancelPending();

        // Debounced ghost‑text trigger
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          triggerInlineSuggest(editorRef.current);
          idleTimerRef.current = null;
        }, IDLE_TRIGGER_DELAY_MS);
      });

      // Cursor position tracking
      editor.onDidChangeCursorPosition((e) => {
        onCursorChangeRef.current?.(e.position.lineNumber);
        if (cursorDebounceRef.current) clearTimeout(cursorDebounceRef.current);
        cursorDebounceRef.current = setTimeout(() => {
          triggerInlineSuggest(editor);
          cursorDebounceRef.current = null;
        }, 200);
      });
    },
    [] // stable, refs inside handle all dynamic values
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ghostProviderRef.current) {
        ghostProviderRef.current.dispose();
        ghostProviderRef.current = null;
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (cursorDebounceRef.current) clearTimeout(cursorDebounceRef.current);
      webLLMRef.current.interruptGenerate();
      geminiRef.current.interruptGenerate();
    };
  }, []);

  return (
    <div className={cn("h-full w-full", className)} dir={direction}>
      <MonacoEditor
        height="100%"
        defaultLanguage="plaintext"
        language="plaintext"
        defaultValue={initialValueRef.current}
        onChange={(newValue) => {
          // This onChange is called for all changes. We already report it inside
          // onDidChangeModelContent, but this is a fallback.
          onChangeRef.current?.(newValue);
        }}
        options={editorOptions}
        onMount={handleEditorDidMount}
        theme={isDark ? "rdat-dark" : "rdat-light"}
      />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="h-full w-full bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-xs">جارٍ تحميل المحرر…</span>
      </div>
    </div>
  );
}
