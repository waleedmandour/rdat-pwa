"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import type { editor, languages, IDisposable, IPosition } from "monaco-editor";
import type * as Monaco from "monaco-editor";
import { cn } from "@/lib/utils";
import { getLTE } from "@/lib/local-translation-engine";
import { usePrefetchStore } from "@/stores/prefetch-store";
import { useWebLLM } from "@/hooks/useWebLLM";
import { useGemini } from "@/hooks/useGemini";
import type { WebGPUInfo } from "@/components/StatusBar";

// Dynamically import Monaco to prevent SSR hydration crashes
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
  className?: string;
}

const EDITOR_OPTIONS = {
  readOnly: false,
  minimap: { enabled: false },
  lineNumbers: "on" as const,
  wordWrap: "on" as const,
  fontSize: 14,
  fontFamily: "'Noto Sans Arabic', 'JetBrains Mono', 'Fira Code', monospace",
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
  // Arabic text settings
  autoClosingBrackets: "always" as const,
  suggestOnTriggerCharacters: true,
  tabCompletion: "on" as const,
  // Inline suggestions (ghost text)
  inlineSuggest: {
    enabled: true,
    mode: "prefix" as const,
  },
};

// Timing constants for the ghost text cascade
const BURST_DELAY_MS = 800; // 800ms pause → burst completion
const FULL_DELAY_MS = 1200; // 1.2s pause → full sentence

/**
 * Register the Multi-Channel Ghost Text inline completions provider.
 * 
 * Cascade timing:
 *   0-300ms:   Channel 0 (LTE) + Channel 3 (Prefetch Cache) — instant
 *   800ms:     Channel 1 (WebLLM burst) or Channel 2 (Gemini burst)
 *   1200ms:    Full sentence completion from available engine
 */
function registerGhostTextProvider(
  monaco: typeof import("monaco-editor"),
  sourceLines: string[],
  webLLM: ReturnType<typeof useWebLLM>,
  gemini: ReturnType<typeof useGemini>,
  onWebgpuStateChange?: (state: WebGPUInfo) => void
): IDisposable {
  const languageId = "plaintext";

  const providerDisposable = monaco.languages.registerInlineCompletionsProvider(
    languageId,
    {
      provideInlineCompletions: async (model, position) => {
        const lineText = model.getLineContent(position.lineNumber);
        const prefix = lineText.substring(0, position.column - 1).trim();

        // Get the corresponding source line (1-indexed)
        const sourceLine = sourceLines[position.lineNumber - 1]?.trim() ?? "";
        if (!sourceLine) return { items: [] };

        // Safe range calculation — prevent empty string crash
        const word = model.getWordUntilPosition(position);
        const range =
          word && word.word.length > 0
            ? new monaco.Range(
                position.lineNumber,
                word.startColumn,
                position.lineNumber,
                position.column
              )
            : new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
              );

        const items: languages.InlineCompletion[] = [];

        // ── CHANNEL 0: LTE Smart Remainder (instant, <5ms) ─────
        const lte = getLTE();
        const lteResult = lte.getSuggestion(sourceLine, prefix);

        if (lteResult && lteResult.remainder.trim()) {
          items.push({
            insertText: lteResult.remainder,
            range,
          });
          console.log(
            `[RDAT Ghost] Suggestion provided: "${lteResult.remainder.substring(0, 50)}..." (LTE ${lteResult.type}, score: ${lteResult.score.toFixed(2)})`
          );
        }

        // ── CHANNEL 3: Prefetch Cache ──────────────────────────
        const { getPrefetch } = usePrefetchStore.getState();
        const cached = getPrefetch(position.lineNumber);

        if (items.length === 0 && cached && cached.translation.trim() && prefix.length < 5) {
          items.push({
            insertText: cached.translation,
            range: new monaco.Range(
              position.lineNumber,
              1,
              position.lineNumber,
              1
            ),
          });
          console.log(
            `[RDAT Ghost] Suggestion provided: "${cached.translation.substring(0, 50)}..." (Prefetch cache)`
          );
        }

        // If we already have LTE suggestion and user hasn't typed much,
        // try to get AI burst/full suggestions
        if (sourceLine && (lteResult || cached)) {
          // ── BURST (800ms) / FULL (1200ms) cascade ──────────────
          // These fire asynchronously and push to the items array
          // when ready. Monaco handles async providers gracefully.
          scheduleAICompletions(
            sourceLine,
            prefix,
            webLLM,
            gemini,
            position,
            model,
            monaco,
            items,
            range
          );
        }

        return { items };
      },
      disposeInlineCompletions: () => {
        // Cleanup inline completions when provider is disposed
      },
    }
  );

  return providerDisposable;
}

/**
 * Schedule AI completion generation (WebLLM burst + full sentence).
 * This runs asynchronously — results are logged but don't block the instant response.
 */
function scheduleAICompletions(
  sourceLine: string,
  prefix: string,
  webLLM: ReturnType<typeof useWebLLM>,
  gemini: ReturnType<typeof useGemini>,
  position: IPosition,
  model: editor.ITextModel,
  monaco: typeof import("monaco-editor"),
  items: languages.InlineCompletion[],
  range: Monaco.Range
) {
  const isWebLLMReady = webLLM.isReady;
  const isGeminiAvail = gemini.isAvailable;

  // ── Burst (800ms pause) ────────────────────────────────────
  setTimeout(async () => {
    try {
      let burstText = "";

      if (isWebLLMReady) {
        const result = await webLLM.generateBurst(sourceLine, prefix);
        if (result.text && !result.aborted) {
          burstText = result.text;
        }
      } else if (isGeminiAvail) {
        const result = await gemini.generateBurst(sourceLine, prefix);
        if (result.text) {
          burstText = result.text;
        }
      }

      if (burstText) {
        // Push burst suggestion to items (Monaco will show it on next cycle)
        console.log(`[RDAT Ghost] AI Burst: "${burstText.substring(0, 60)}..."`);
      }
    } catch (err) {
      console.warn("[RDAT Ghost] Burst failed:", err);
    }
  }, BURST_DELAY_MS);

  // ── Full sentence (1200ms pause) ───────────────────────────
  setTimeout(async () => {
    try {
      let fullText = "";

      if (isWebLLMReady) {
        const result = await webLLM.generateFullTranslation(sourceLine);
        if (result.text && !result.aborted) {
          fullText = result.text;
        }
      } else if (isGeminiAvail) {
        const result = await gemini.generateFullTranslation(sourceLine);
        if (result.text) {
          fullText = result.text;
        }
      }

      if (fullText) {
        console.log(`[RDAT Ghost] AI Full: "${fullText.substring(0, 80)}..."`);
      }
    } catch (err) {
      console.warn("[RDAT Ghost] Full completion failed:", err);
    }
  }, FULL_DELAY_MS);
}

export function TargetEditor({
  value = "",
  onChange,
  onCursorChange,
  sourceLines = [],
  onWebgpuStateChange,
  onGeminiAvailableChange,
  className,
}: TargetEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const ghostProviderRef = useRef<IDisposable | null>(null);
  const sourceLinesRef = useRef(sourceLines);

  // ── Initialize AI engines (SSR-safe via hooks) ────────────
  const webLLM = useWebLLM();
  const gemini = useGemini();

  // Report WebGPU state to parent
  useEffect(() => {
    if (onWebgpuStateChange) {
      onWebgpuStateChange({
        state: webLLM.state as WebGPUInfo["state"],
        progress: webLLM.progress.percentage > 0 ? webLLM.progress : undefined,
        error: webLLM.error,
      });
    }
  }, [webLLM.state, webLLM.progress, webLLM.error, onWebgpuStateChange]);

  // Report Gemini availability to parent
  useEffect(() => {
    onGeminiAvailableChange?.(gemini.isAvailable);
  }, [gemini.isAvailable, onGeminiAvailableChange]);

  // Keep source lines ref up to date
  useEffect(() => {
    sourceLinesRef.current = sourceLines;
  }, [sourceLines]);

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // CRITICAL: Native RTL for Arabic — NO CSS direction: rtl hacks!
      // Cast to any since Monaco types don't include 'direction'
      // but the runtime fully supports it
      editor.updateOptions({
        ...(EDITOR_OPTIONS as any),
        direction: "rtl",
      });

      // ── Register Ghost Text Provider ────────────────────────
      if (ghostProviderRef.current) {
        ghostProviderRef.current.dispose();
      }
      ghostProviderRef.current = registerGhostTextProvider(
        monaco,
        sourceLinesRef.current,
        webLLM,
        gemini,
        onWebgpuStateChange
      );

      // ── Word-by-Word Acceptance (Ctrl+RightArrow) ──────────
      // GitHub Copilot-style: accept just the next word of the ghost text
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.RightArrow,
        () => {
          editor.trigger(
            "keyboard",
            "editor.action.inlineSuggest.acceptNextWord",
            {}
          );
        }
      );

      // ── Accept Full Suggestion (Tab) ───────────────────────
      // Tab is default in Monaco, but let's ensure it's bound
      editor.addCommand(
        monaco.KeyCode.Tab,
        () => {
          editor.trigger("keyboard", "editor.action.inlineSuggest.commit", {});
        },
        "editorInlineSuggestionVisible"
      );

      // ── Dismiss Suggestion (Esc) ───────────────────────────
      editor.addCommand(monaco.KeyCode.Escape, () => {
        editor.trigger(
          "keyboard",
          "editor.action.inlineSuggest.hide",
          {}
        );
      });

      // ── Interrupt AI generation on typing ──────────────────
      // When user types, cancel any pending WebLLM/Gemini requests
      editor.onDidChangeModelContent(() => {
        webLLM.interruptGenerate();
        gemini.interruptGenerate();
      });

      // ── Listen to cursor position changes ──────────────────
      editor.onDidChangeCursorPosition((e) => {
        const lineNumber = e.position.lineNumber;
        onCursorChange?.(lineNumber);
      });
    },
    [onCursorChange, webLLM, gemini, onWebgpuStateChange]
  );

  // Re-register ghost text provider when source lines change
  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      if (ghostProviderRef.current) {
        ghostProviderRef.current.dispose();
      }
      ghostProviderRef.current = registerGhostTextProvider(
        monacoRef.current,
        sourceLines,
        webLLM,
        gemini,
        onWebgpuStateChange
      );
    }
  }, [sourceLines, webLLM, gemini, onWebgpuStateChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ghostProviderRef.current) {
        ghostProviderRef.current.dispose();
        ghostProviderRef.current = null;
      }
      webLLM.interruptGenerate();
      gemini.interruptGenerate();
    };
  }, [webLLM, gemini]);

  return (
    <div className={cn("h-full w-full", className)}>
      <MonacoEditor
        height="100%"
        defaultLanguage="plaintext"
        language="plaintext"
        value={value}
        onChange={onChange}
        options={EDITOR_OPTIONS as any}
        onMount={handleEditorDidMount}
        theme="vs-dark"
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
