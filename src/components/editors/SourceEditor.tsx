"use client";

import React, { useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

// Dynamically import Monaco to prevent SSR hydration crashes
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

interface SourceEditorProps {
  value?: string;
  onChange?: (value: string | undefined) => void;
  highlightedLine?: number | null;
  className?: string;
  direction?: "ltr" | "rtl";
}

const EDITOR_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  lineNumbers: "on" as const,
  wordWrap: "on" as const,
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
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
  value = "",
  onChange,
  highlightedLine,
  className,
  direction = "ltr",
}: SourceEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom themes for both dark and light modes
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

    // Apply editor options (RTL is handled via CSS, not Monaco direction option)
    editor.updateOptions({
      ...EDITOR_OPTIONS,
      theme: isDark ? "rdat-dark" : "rdat-light",
    });
  };

  // Direction changes are handled via CSS on the editor container,
  // not via Monaco's non-existent `direction` option.

  // Update Monaco theme when app theme changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      editorRef.current.updateOptions({
        theme: isDark ? "rdat-dark" : "rdat-light",
      } as any);
    }
  }, [isDark]);

  // Update line highlight decorations
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;

    // Clear previous decorations
    if (decorationsRef.current.length > 0) {
      editor.deltaDecorations(decorationsRef.current, []);
      decorationsRef.current = [];
    }

    // Apply new highlight
    if (highlightedLine !== null && highlightedLine !== undefined) {
      const range = new monaco.Range(
        highlightedLine,
        1,
        highlightedLine,
        1
      );

      decorationsRef.current = editor.deltaDecorations([], [
        {
          range,
          options: {
            isWholeLine: true,
            className: "source-line-highlight",
            inlineClassName: "source-line-highlight-inline",
            minimap: {
              color: "rgba(2, 132, 199, 0.3)",
              position: 1,
            },
            overviewRuler: {
              color: "rgba(2, 132, 199, 0.5)",
              position: 1,
            },
          },
        },
      ]);
    }
  }, [highlightedLine]);

  return (
    <div className={cn("h-full w-full", className)}>
      <MonacoEditor
        height="100%"
        defaultLanguage="plaintext"
        language="plaintext"
        value={value}
        onChange={onChange}
        options={EDITOR_OPTIONS}
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
