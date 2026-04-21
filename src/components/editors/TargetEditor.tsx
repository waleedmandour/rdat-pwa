"use client";

import React, { useRef, useCallback, useEffect } from "react";
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
  direction?: "ltr" | "rtl";
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
  // Arabic RTL settings
  autoClosingBrackets: "always" as const,
  suggestOnTriggerCharacters: true,
  tabCompletion: "on" as const,
  direction: "rtl" as const,
  // Inline suggestions (ghost text)
  inlineSuggest: {
    enabled: true,
    mode: "prefix" as const,
  },
};

/**
 * Google-like debounce delay: after the user stops typing for this
 * many milliseconds, we re-trigger the inline suggest so that
 * slower channels (RAG, AI) get a chance to surface ghost text.
 */
const IDLE_TRIGGER_DELAY_MS = 350;

/**
 * Calculate ghost text range for Monaco inline completion.
 * Monaco handles RTL positioning internally when direction:"rtl" is set
 * — no Unicode bidi control characters needed.
 */
function calculateGhostTextRange(
  monaco: typeof import("monaco-editor"),
  position: { lineNumber: number; column: number },
  word: { startColumn: number; endColumn: number; word: string }
): Monaco.Range {
  if (word && word.word.length > 0) {
    return new monaco.Range(
      position.lineNumber,
      word.startColumn,
      position.lineNumber,
      position.column
    );
  }
  return new monaco.Range(
    position.lineNumber,
    position.column,
    position.lineNumber,
    position.column
  );
}

/**
 * Register the Multi-Channel Ghost Text inline completions provider.
 *
 * This version uses MonacoSuggestionProvider to properly orchestrate
 * the three-phase suggestion pipeline (LTE → RAG+Prefetch → WebLLM+Gemini).
 *
 * Key fixes vs. the original implementation:
 *  1. Uses MonacoSuggestionProvider.getSuggestions() instead of ad-hoc LTE calls
 *  2. sourceLines are read from a ref so they're never stale
 *  3. No \u202E RTL override — Monaco handles RTL natively
 *  4. Prefetch cache is used regardless of prefix length
 *  5. Stale-request cancellation prevents out-of-order suggestions
 *  6. AI completions re-trigger Monaco inline suggest when ready
 */
function registerGhostTextProvider(
  monaco: typeof import("monaco-editor"),
  sourceLinesRef: React.MutableRefObject<string[]>,
  webLLM: ReturnType<typeof useWebLLM>,
  gemini: ReturnType<typeof useGemini>,
  rag: ReturnType<typeof useRAG>,
  suggestionProvider: MonacoSuggestionProvider,
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
): IDisposable {
  const languageId = "plaintext";

  // Track the last content-version to cancel stale suggestions
  let contentVersion = 0;

  const providerDisposable = monaco.languages.registerInlineCompletionsProvider(
    languageId,
    {
      provideInlineCompletions: async (model, position) => {
        const currentVersion = ++contentVersion;

        const lineText = model.getLineContent(position.lineNumber);
        const prefix = lineText.substring(0, position.column - 1).trim();

        // Read source lines from the ref (always up-to-date)
        const sourceLines = sourceLinesRef.current;
        const sourceLine = sourceLines[position.lineNumber - 1]?.trim() ?? "";
        if (!sourceLine) return { items: [] };

        // Calculate range for ghost text
        const word = model.getWordUntilPosition(position);
        const range = calculateGhostTextRange(monaco, position, word);

        // ── Immediate LTE channel (synchronous, <5ms) ──────────────
        // Show LTE result instantly while async channels load
        const lte = getLTE();
        const lteResult = lte.getSuggestion(sourceLine, prefix);

        const items: languages.InlineCompletion[] = [];

        if (lteResult && lteResult.remainder.trim()) {
          items.push({
            insertText: lteResult.remainder,
            range,
          });
          console.log(
            `[RDAT Ghost] LTE suggestion: "${lteResult.remainder.substring(0, 50)}..." (score: ${lteResult.score.toFixed(2)})`
          );
        }

        // ── Prefetch cache (synchronous) ───────────────────────────
        const { getPrefetch } = usePrefetchStore.getState();
        const cached = getPrefetch(position.lineNumber);

        if (cached && cached.translation.trim()) {
          // Compute the remainder from the cached translation based on prefix
          const cachedRemainder = computeCachedRemainder(cached.translation, prefix);
          if (cachedRemainder && (!lteResult || !lteResult.remainder.trim())) {
            items.push({
              insertText: cachedRemainder,
              range,
            });
            console.log(
              `[RDAT Ghost] Cache suggestion: "${cachedRemainder.substring(0, 50)}..."`
            );
          }
        }

        // ── Async channels via MonacoSuggestionProvider ─────────────
        // Run the full pipeline in the background. When results arrive,
        // re-trigger Monaco inline suggest so it picks up the new suggestions.
        suggestionProvider.cancelPending(); // cancel any previous in-flight request

        suggestionProvider
          .getSuggestions(sourceLine, prefix, {
            lte: async () => {
              // Already handled synchronously above, but include for pipeline completeness
              return lteResult?.remainder ?? "";
            },
            rag: async () => {
              if (!rag.state.isCorpusLoaded) return "";
              try {
                const hits = await rag.search(sourceLine, 1);
                if (hits.length > 0 && hits[0].ar) {
                  const remainder = computeCachedRemainder(hits[0].ar, prefix);
                  return remainder || hits[0].ar;
                }
              } catch {
                // RAG timeout — skip
              }
              return "";
            },
            prefetch: async () => {
              if (!cached) return "";
              return computeCachedRemainder(cached.translation, prefix) || "";
            },
            webllm: async () => {
              if (!webLLM.isReady) return "";
              try {
                const result = await webLLM.generateBurst(sourceLine, prefix);
                if (result.text && !result.aborted) {
                  return result.text;
                }
              } catch {
                // WebLLM timeout — skip
              }
              return "";
            },
            gemini: async () => {
              if (!gemini.isAvailable) return "";
              try {
                const result = await gemini.generateBurst(sourceLine, prefix);
                if (result.text) {
                  return result.text;
                }
              } catch {
                // Gemini timeout — skip
              }
              return "";
            },
          })
          .then((suggestions) => {
            // Stale check: discard if user typed more since we started
            if (currentVersion !== contentVersion) return;
            if (suggestions.length === 0) return;

            // Find the best suggestion that isn't just the LTE one we already showed
            const bestNew = suggestions.find(
              (s) =>
                s.source !== "lte" &&
                s.text.trim() &&
                (!lteResult || s.text !== lteResult.remainder)
            );

            if (bestNew) {
              console.log(
                `[RDAT Ghost] AI/RAG suggestion from ${bestNew.source}: "${bestNew.text.substring(0, 60)}..." (confidence: ${bestNew.confidence.toFixed(2)})`
              );
            }

            // Re-trigger Monaco inline suggest so it calls provideInlineCompletions
            // again with the updated state (which now has AI/RAG results cached).
            // This is the KEY mechanism for Google-like cascading ghost text.
            triggerInlineSuggest(editorRef.current);
          })
          .catch((err) => {
            console.warn("[RDAT Ghost] Async pipeline error:", err);
          });

        return { items };
      },
      disposeInlineCompletions: () => {
        // Cleanup
      },
    }
  );

  return providerDisposable;
}

/**
 * Compute the remainder of a cached/Prefetch translation after the user's prefix.
 * Strips the matching prefix portion and returns only what's left to complete.
 * This avoids the duplicate-text ghost-text bug.
 */
function computeCachedRemainder(
  fullTranslation: string,
  typedPrefix: string
): string {
  const trimmed = fullTranslation.trim();
  const prefix = typedPrefix.trim();

  if (!prefix) return trimmed;

  if (trimmed.startsWith(prefix)) {
    const remainder = trimmed.substring(prefix.length).trimStart();
    return remainder || trimmed;
  }

  // Try fuzzy alignment using character overlap
  const prefixLen = prefix.length;
  const maxOffset = Math.min(Math.ceil(prefixLen * 1.5), trimmed.length);
  let bestOffset = 0;
  let bestScore = 0;

  for (let offset = 1; offset <= maxOffset; offset += Math.max(1, Math.floor(prefixLen / 8))) {
    const candidate = trimmed.substring(0, offset);
    // Simple character overlap score
    let matches = 0;
    const minLen = Math.min(prefix.length, candidate.length);
    for (let i = 0; i < minLen; i++) {
      if (prefix[i] === candidate[i]) matches++;
    }
    const score = matches / Math.max(prefix.length, candidate.length);
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  if (bestScore > 0.4) {
    const remainder = trimmed.substring(bestOffset).trimStart();
    return remainder || trimmed;
  }

  // No reasonable alignment — return full translation as suggestion
  return trimmed;
}

/**
 * Re-trigger Monaco's inline suggestion mechanism.
 * This is the crucial bridge that makes Google-like cascading ghost text work:
 * after async channels produce results, we ask Monaco to re-evaluate
 * inline completions, which will call provideInlineCompletions again.
 */
function triggerInlineSuggest(
  editor: editor.IStandaloneCodeEditor | null
): void {
  if (!editor) return;
  try {
    // Trigger inline suggest — this causes Monaco to call
    // provideInlineCompletions again, which now has access to
    // cached AI/RAG results.
    editor.trigger("rdat-ghost-text", "editor.action.inlineSuggest.trigger", {});
  } catch {
    // Editor may be in a state where triggering isn't possible
  }
}

export function TargetEditor({
  value = "",
  onChange,
  onCursorChange,
  sourceLines = [],
  onWebgpuStateChange,
  onGeminiAvailableChange,
  className,
  direction = "rtl",
}: TargetEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const ghostProviderRef = useRef<IDisposable | null>(null);
  const suggestionProviderRef = useRef<MonacoSuggestionProvider | null>(null);
  const providerRegisteredRef = useRef(false);

  // ── Ref for sourceLines so the provider always reads fresh data ──
  const sourceLinesRef = useRef<string[]>(sourceLines);
  sourceLinesRef.current = sourceLines; // Update on every render

  // ── Debounce timer for idle-trigger re-suggest ──────────────────
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initialize AI engines (SSR-safe via hooks) ────────────
  const webLLM = useWebLLM();
  const gemini = useGemini();
  const rag = useRAG();

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

  // Update direction if it changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ direction } as any);
    }
  }, [direction]);

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // CRITICAL: Dynamic RTL/LTR support
      editor.updateOptions({
        ...(EDITOR_OPTIONS as any),
        direction,
      });

      // Register provider ONCE (not on every render) to fix memory leak
      if (!providerRegisteredRef.current) {
        // Initialize suggestion provider
        if (!suggestionProviderRef.current) {
          suggestionProviderRef.current = new MonacoSuggestionProvider();
        }

        // Dispose old provider if exists
        if (ghostProviderRef.current) {
          ghostProviderRef.current.dispose();
        }

        // Register new provider with ref-based sourceLines access
        ghostProviderRef.current = registerGhostTextProvider(
          monaco,
          sourceLinesRef,
          webLLM,
          gemini,
          rag,
          suggestionProviderRef.current,
          editorRef
        );

        providerRegisteredRef.current = true;
      }

      // Update direction if it changes
      const currentDirection = editor.getOptions().get(monaco.editor.EditorOption.direction);
      if (currentDirection !== direction) {
        editor.updateOptions({ direction } as any);
      }

      // ── Word-by-Word Acceptance (Ctrl+RightArrow) ──────────
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
      editor.onDidChangeModelContent(() => {
        webLLM.interruptGenerate();
        gemini.interruptGenerate();

        // Cancel any stale suggestion pipeline
        suggestionProviderRef.current?.cancelPending();

        // ── Idle-trigger: Google-like behavior ─────────────────
        // After the user stops typing for IDLE_TRIGGER_DELAY_MS,
        // re-trigger inline suggest so slower channels (RAG, AI)
        // get a chance to show ghost text.
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
        }
        idleTimerRef.current = setTimeout(() => {
          triggerInlineSuggest(editorRef.current);
          idleTimerRef.current = null;
        }, IDLE_TRIGGER_DELAY_MS);
      });

      // ── Listen to cursor position changes ──────────────────
      editor.onDidChangeCursorPosition((e) => {
        const lineNumber = e.position.lineNumber;
        onCursorChange?.(lineNumber);
      });
    },
    [onCursorChange, webLLM, gemini, rag, direction]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ghostProviderRef.current) {
        ghostProviderRef.current.dispose();
        ghostProviderRef.current = null;
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      webLLM.interruptGenerate();
      gemini.interruptGenerate();
      providerRegisteredRef.current = false;
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
        options={{
          ...(EDITOR_OPTIONS as any),
          direction: "rtl",
        }}
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
