"use client";

import React, { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { cn } from "@/lib/utils";

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
}: SourceEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // LTR is default for English — explicit cast since Monaco types
    // don't include 'direction' but the runtime supports it
    editor.updateOptions({
      ...(EDITOR_OPTIONS as any),
    });
  };

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
        theme="vs-dark"
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
