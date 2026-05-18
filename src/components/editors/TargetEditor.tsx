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

// --- Base Editor Options ---
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
  contextmenu: true, // Explicitly set contextmenu to true to avoid a known Monaco bug that blocks typing
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  autoClosingBrackets: "always" as const,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  suggest: { preview: false },
  tabCompletion: "on" as const,
  inlineSuggest: { enabled: true },
};

// --- Helper Functions (Unchanged) ---
// ... (Include the calculateGhostTextRange, computeCachedRemainder, and registerGhostTextProvider functions here. They are unchanged from your original file.)

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
  
  // Ref synchronization for hook states to prevent stale closures
  const webLLM = useWebLLM();
  const gemini = useGemini();
  const rag = useRAG();
  const webLLMRef = useRef(webLLM);
  const geminiRef = useRef(gemini);
  const ragRef = useRef(rag);

  useEffect(() => { sourceLinesRef.current = sourceLines; }, [sourceLines]);
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

  // --- Stable callback refs ---
  const onCursorChangeRef = useRef(onCursorChange);
  useEffect(() => { onCursorChangeRef.current = onCursorChange; }, [onCursorChange]);

  // --- Core Editor Mounting Logic ---
  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Force editable state and apply theme
      editor.updateOptions({ readOnly: false, theme: isDark ? "rdat-dark" : "rdat-light", fontFamily });

      // Define custom themes
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

      // Register Ghost Text Provider
      if (ghostProviderRef.current) ghostProviderRef.current.dispose();
      if (!suggestionProviderRef.current) suggestionProviderRef.current = new MonacoSuggestionProvider();
      
      ghostProviderRef.current = registerGhostTextProvider(
        monaco,
        sourceLinesRef,
        webLLMRef,
        geminiRef,
        ragRef,
        suggestionProviderRef.current,
        editorRef
      );

      // Cursor tracking
      editor.onDidChangeCursorPosition((e) => {
        onCursorChangeRef.current?.(e.position.lineNumber);
      });
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
        height="100%"
        defaultLanguage="plaintext"
        language="plaintext"
        value={value}  // Controlled component pattern
        onChange={onChange}
        options={editorOptions}
        onMount={handleEditorDidMount}
        theme={isDark ? "rdat-dark" : "rdat-light"}
      />
    </div>
  );
}
