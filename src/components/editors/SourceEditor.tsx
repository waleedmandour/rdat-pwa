"use client";

import React, { useRef, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

interface SourceEditorProps {
  defaultValue?: string;           // initial content (uncontrolled)
  onChange?: (value: string | undefined) => void;
  highlightedLine?: number | null;
  className?: string;
  direction?: "ltr" | "rtl";
  resetKey?: string;              // forces remount on external content change
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
  renderLineHighlight: "none" as const,
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
};

export function SourceEditor({
  defaultValue = "",
  onChange,
  highlightedLine,
  className,
  direction = "ltr",
  resetKey,
}: SourceEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

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

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Ensure editable
      editor.updateOptions({ readOnly: false, theme: isDark ? "rdat-dark" : "rdat-light", fontFamily });

      // Themes
      monaco.editor.defineTheme("rdat-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [],
        colors: {},
      });
      monaco.editor.defineTheme("rdat-light", {
        base: "vs",
        inherit: true,
        rules: [],
        colors: {},
      });

      // Report changes upward (uncontrolled)
      const contentListener = editor.onDidChangeModelContent(() => {
        onChangeRef.current?.(editor.getValue());
      });

      return () => {
        contentListener.dispose();
      };
    },
    [isDark, fontFamily]
  );

  // Update theme and font on change
  useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
      editor.updateOptions({
        theme: isDark ? "rdat-dark" : "rdat-light",
        fontFamily,
      } as any);
    }
  }, [isDark, fontFamily]);

  // Update highlighted line decorations
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    if (decorationsRef.current.length > 0) {
      editor.deltaDecorations(decorationsRef.current, []);
      decorationsRef.current = [];
    }

    if (highlightedLine !== null && highlightedLine !== undefined) {
      const range = new monaco.Range(highlightedLine, 1, highlightedLine, 1);
      decorationsRef.current = editor.deltaDecorations([], [
        {
          range,
          options: {
            isWholeLine: true,
            className: "source-line-highlight",
            inlineClassName: "source-line-highlight-inline",
            minimap: { color: "rgba(2, 132, 199, 0.3)", position: 1 },
            overviewRuler: { color: "rgba(2, 132, 199, 0.5)", position: 1 },
          },
        },
      ]);
    }
  }, [highlightedLine]);

  return (
    <div className={cn("h-full w-full", className)} dir={direction}>
      <MonacoEditor
        key={resetKey ?? "source-editor"}   // remount when resetKey changes
        height="100%"
        defaultLanguage="plaintext"
        language="plaintext"
        defaultValue={defaultValue}
        options={editorOptions}
        onMount={handleEditorDidMount}
        theme={isDark ? "rdat-dark" : "rdat-light"}
      />
      <style jsx global>{`
        .source-line-highlight {
          background-color: rgba(2, 132, 199, 0.08) !important;
        }
        .source-line-highlight-inline {
          background-color: rgba(2, 132, 199, 0.08) !important;
        }
      `}</style>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="h-full w-full bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-xs">Loading editor…</span>
      </div>
    </div>
  );
}
