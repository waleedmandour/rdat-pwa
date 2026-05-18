"use client";

import React, { useRef, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import type { editor, IDisposable } from "monaco-editor";
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
  defaultValue?: string;           // initial content (uncontrolled)
  onChange?: (value: string | undefined) => void;
  onCursorChange?: (lineNumber: number) => void;
  sourceLines?: string[];
  onWebgpuStateChange?: (state: WebGPUInfo) => void;
  onGeminiAvailableChange?: (available: boolean) => void;
  onRagStateChange?: (state: import("@/hooks/useRAG").RAGState) => void;
  className?: string;
  direction?: "ltr" | "rtl";
  translationKey?: string;        // changes when content is replaced externally
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
  webLLMRef: React.MutableRefObject<any>,
  geminiRef: React.MutableRefObject<any>,
  ragRef: React.MutableRefObject<any>,
  suggestionProvider: MonacoSuggestionProvider,
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
): IDisposable {
  const languageId = "plaintext";
  let contentVersion = 0;

  return monaco.languages.registerInlineCompletionsProvider(languageId, {
    provideInlineCompletions: async (model, position) => {
      try {
        const currentVersion = ++contentVersion;
        const lineText = model.getLineContent(position.lineNumber);
        const prefix = lineText.substring(0, position.column - 1).trim();
        const sourceLines = sourceLinesRef.current;
        const sourceLine = sourceLines[position.lineNumber - 1]?.trim() ?? "";

        const isMeaningful = (t: string) => t.trim() && t.trim() !== prefix;
        const range = calculateGhostTextRange(monaco, position);

        const items: languages.InlineCompletion[] = [];
        const lte = getLTE();
        const lteResult = lte.getSuggestion(sourceLine, prefix);
        const lteRemainder = lteResult?.remainder?.trim() ?? "";
        if (isMeaningful(lteRemainder)) items.push({ insertText: lteRemainder, range });

        const { getPrefetch } = usePrefetchStore.getState();
        const cached = getPrefetch(position.lineNumber);
        if (cached?.translation.trim()) {
          const rem = computeCachedRemainder(cached.translation, prefix);
          if (isMeaningful(rem) && !lteRemainder) items.push({ insertText: rem, range });
        }

        if (items.length === 0 && prefix.length > 0) {
          if (lteResult?.match && prefix === lteResult.match.trim()) return { items: [] };
          if (cached?.translation && prefix === cached.translation.trim()) return { items: [] };
        }

        // Async pipeline
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
                  const rem = computeCachedRemainder(hits[0].ar, prefix);
                  return isMeaningful(rem) ? rem : "";
                }
              } catch {}
              return "";
            },
            prefetch: async () => {
              if (!cached) return "";
              const rem = computeCachedRemainder(cached.translation, prefix);
              return isMeaningful(rem) ? rem : "";
            },
            webllm: async () => {
              const wllm = webLLMRef.current;
              if (!wllm.isReady) return "";
              try {
                const result = await wllm.generateBurst(sourceLine, prefix);
                if (result.text && !result.aborted) {
                  const t = result.text.trim();
                  return t && t !== prefix ? t : "";
                }
              } catch {}
              return "";
            },
            gemini: async () => {
              const gem = geminiRef.current;
              if (!gem.isAvailable) return "";
              try {
                const result = await gem.generateBurst(sourceLine, prefix);
                if (result.text) {
                  const t = result.text.trim();
                  return t && t !== prefix ? t : "";
                }
              } catch {}
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
          .catch((e) => console.warn("[RDAT Ghost] Async error:", e));

        return { items };
      } catch (err) {
        console.error("[RDAT Ghost] Fatal error:", err);
        return { items: [] };
      }
    },
    disposeInlineCompletions: () => {},
  });
}

function computeCachedRemainder(full: string, prefix: string): string {
  const trimmed = full.trim();
  const p = prefix.trim();
  if (!p) return trimmed;
  return trimmed.startsWith(p) ? trimmed.substring(p.length).trimStart() : "";
}

function triggerInlineSuggest(editor: editor.IStandaloneCodeEditor | null) {
  if (!editor) return;
  try {
    editor.trigger("rdat-ghost-text", "editor.action.inlineSuggest.trigger", {});
  } catch {}
}

export function TargetEditor({
  defaultValue = "",
  onChange,
  onCursorChange,
  sourceLines = [],
  onWebgpuStateChange,
  onGeminiAvailableChange,
  onRagStateChange,
  className,
  direction = "rtl",
  translationKey,
}: TargetEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const ghostProviderRef = useRef<IDisposable | null>(null);
  const suggestionProviderRef = useRef<MonacoSuggestionProvider | null>(null);
  const sourceLinesRef = useRef<string[]>(sourceLines);
  useEffect(() => { sourceLinesRef.current = sourceLines; }, [sourceLines]);

  const webLLM = useWebLLM();
  const gemini = useGemini();
  const rag = useRAG();
  const webLLMRef = useRef(webLLM);
  const geminiRef = useRef(gemini);
  const ragRef = useRef(rag);
  useEffect(() => { webLLMRef.current = webLLM; }, [webLLM]);
  useEffect(() => { geminiRef.current = gemini; }, [gemini]);
  useEffect(() => { ragRef.current = rag; }, [rag]);

  const { theme } = useTheme();
  const isDark = theme === "dark";

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

  // Callback refs for stable up‑calling
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const onCursorChangeRef = useRef(onCursorChange);
  useEffect(() => { onCursorChangeRef.current = onCursorChange; }, [onCursorChange]);
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

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Force editable
      editor.updateOptions({ readOnly: false, theme: isDark ? "rdat-dark" : "rdat-light", fontFamily });

      // Themes
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

      // Ghost text provider
      if (ghostProviderRef.current) ghostProviderRef.current.dispose();
      if (!suggestionProviderRef.current)
        suggestionProviderRef.current = new MonacoSuggestionProvider();
      ghostProviderRef.current = registerGhostTextProvider(
        monaco,
        sourceLinesRef,
        webLLMRef,
        geminiRef,
        ragRef,
        suggestionProviderRef.current,
        editorRef
      );

      // Initial trigger
      setTimeout(() => triggerInlineSuggest(editor), 500);

      editor.onDidFocusEditorWidget(() => {
        setTimeout(() => triggerInlineSuggest(editor), 300);
      });

      // Word‑by‑word acceptance
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.RightArrow,
        () => editor.trigger("keyboard", "editor.action.inlineSuggest.acceptNextWord", {})
      );

      // Tab commit
      editor.addCommand(
        monaco.KeyCode.Tab,
        () => editor.trigger("keyboard", "editor.action.inlineSuggest.commit", {}),
        "editorInlineSuggestionVisible"
      );

      // User content change → propagate upward
      const contentListener = editor.onDidChangeModelContent(() => {
        onChangeRef.current?.(editor.getValue());
        // Interrupt AI
        webLLMRef.current.interruptGenerate();
        geminiRef.current.interruptGenerate();
        suggestionProviderRef.current?.cancelPending();
      });

      // Cursor tracking
      const cursorListener = editor.onDidChangeCursorPosition((e) => {
        onCursorChangeRef.current?.(e.position.lineNumber);
      });

      // Idle ghost text trigger (separate timer)
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const contentListener2 = editor.onDidChangeModelContent(() => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          triggerInlineSuggest(editor);
          idleTimer = null;
        }, IDLE_TRIGGER_DELAY_MS);
      });

      return () => {
        contentListener.dispose();
        cursorListener.dispose();
        contentListener2.dispose();
        if (idleTimer) clearTimeout(idleTimer);
      };
    },
    [isDark, fontFamily]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ghostProviderRef.current?.dispose();
      webLLMRef.current.interruptGenerate();
      geminiRef.current.interruptGenerate();
    };
  }, []);

  return (
    <div className={cn("h-full w-full", className)} dir={direction}>
      <MonacoEditor
        key={translationKey ?? "target-editor"}   // remount when segment changes
        height="100%"
        defaultLanguage="plaintext"
        language="plaintext"
        defaultValue={defaultValue}
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
