"use client";

import React, { useEffect, useRef, useCallback } from "react";
import type { editor } from "monaco-editor";

interface SegmentHighlighterProps {
  sourceLineNumber: number | null;
  targetLineNumber: number | null;
  sourceEditorRef: React.MutableRefObject<any>;
  targetEditorRef: React.MutableRefObject<any>;
}

/**
 * SegmentHighlighter — visually syncs source and target editor panes.
 *
 * When the cursor moves to Line X in the Target (Arabic) editor,
 * this component highlights Line X in the Source (English) editor
 * using Monaco's native deltaDecorations API with a subtle amber/blue
 * background.
 *
 * IMPORTANT: Uses Monaco's native API — no CSS direction: rtl hacks.
 */
export function SegmentHighlighter({
  sourceLineNumber,
  targetLineNumber,
  sourceEditorRef,
  targetEditorRef,
}: SegmentHighlighterProps) {
  const sourceDecorations = useRef<string[]>([]);
  const targetDecorations = useRef<string[]>([]);

  const applyHighlight = useCallback(
    (
      editorInstance: editor.IStandaloneCodeEditor | null,
      monaco: typeof import("monaco-editor") | null,
      lineNumber: number | null,
      decorations: React.MutableRefObject<string[]>,
      type: "source" | "target"
    ) => {
      if (!editorInstance || !monaco) return;

      // Clear previous decorations
      if (decorations.current.length > 0) {
        editorInstance.deltaDecorations(decorations.current, []);
        decorations.current = [];
      }

      if (lineNumber === null || lineNumber === undefined) return;

      // Safety: clamp to valid range
      const model = editorInstance.getModel();
      if (!model) return;
      const maxLine = model.getLineCount();
      const safeLine = Math.min(lineNumber, maxLine);

      const range = new monaco.Range(safeLine, 1, safeLine, 1);

      const isSource = type === "source";

      decorations.current = editorInstance.deltaDecorations([], [
        {
          range,
          options: {
            isWholeLine: true,
            className: isSource
              ? "sync-highlight-source"
              : "sync-highlight-target",
            inlineClassName: isSource
              ? "sync-highlight-source-inline"
              : "sync-highlight-target-inline",
            minimap: {
              color: isSource
                ? "rgba(2, 132, 199, 0.25)"
                : "rgba(217, 119, 6, 0.25)",
              position: 1,
            },
            overviewRuler: {
              color: isSource
                ? "rgba(2, 132, 199, 0.4)"
                : "rgba(217, 119, 6, 0.4)",
              position: 1,
            },
            glyphMarginClassName: isSource
              ? "sync-glyph-source"
              : "sync-glyph-target",
          },
        },
      ]);
    },
    []
  );

  // Sync source highlight based on target cursor position
  useEffect(() => {
    const sourceEditor = sourceEditorRef.current;
    const targetEditor = targetEditorRef.current;

    // We highlight the source line that corresponds to the target line
    // For 1:1 segment alignment, source line = target line
    if (targetLineNumber !== null && sourceEditor) {
      // Get monaco from the editor instance
      const monaco = (window as any).monaco;
      applyHighlight(
        sourceEditor,
        monaco,
        targetLineNumber,
        sourceDecorations,
        "source"
      );
    }
  }, [targetLineNumber, sourceEditorRef, applyHighlight]);

  // Also highlight target line when source is clicked (bidirectional sync)
  useEffect(() => {
    const targetEditor = targetEditorRef.current;
    if (sourceLineNumber !== null && targetEditor) {
      const monaco = (window as any).monaco;
      applyHighlight(
        targetEditor,
        monaco,
        sourceLineNumber,
        targetDecorations,
        "target"
      );
    }
  }, [sourceLineNumber, targetEditorRef, applyHighlight]);

  return null; // This is a logic-only component — no visual output
}
