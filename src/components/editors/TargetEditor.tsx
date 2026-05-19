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

// Dynamically import Monaco to prevent SSR hydration crashes
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
  renderLineHighlight: "all" as const,
  renderLineHighlightOnlyWhenFocus: true,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 16, bottom: 16 },
  bracketPairColorization: { enabled: false },
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  contextmenu: true, // Explicitly enabled — prevents a known Monaco bug that blocks typing
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  // Prevent dropdown suggestions from fighting with ghost text
  autoClosingBrackets: "always" as const,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  suggest: { preview: false },
  tabCompletion: "on" as const,
  // Inline suggestions (ghost text)
  inlineSuggest: {
    enabled: true,
    // Do NOT use mode: "prefix" — it causes Monaco to silently reject
    // suggestions where insertText doesn't start with the text covered
    // by the range. Since we return remainder-only text (the part the
    // user hasn't typed yet), prefix validation always fails.
  },
};

/**
 * Google-like debounce delay: after the user stops typing for this
 * many milliseconds, we re-trigger the inline suggest so that
 * slower channels (RAG, AI) get a chance to surface ghost text.
 */
const IDLE_TRIGGER_DELAY_MS = 400;

/**
 * Minimum gap between provideInlineCompletions calls (ms).
 * Prevents the INP (Interaction to Next Paint) issue where rapid-fire
 * ghost text requests block the main thread for 1+ seconds.
 */
const PROVIDER_THROTTLE_MS = 300;

/**
 * Calculate ghost text range for Monaco inline completion.
 *
 * The range MUST always be empty (cursor position to cursor position).
 * This is the standard Monaco approach used by GitHub Copilot.
 * With an empty range, there is no text to match against, so Monaco
 * always accepts the suggestion and renders the ghost text at the
 * cursor position.
 *
 * RTL positioning is handled by the browser's bidirectional algorithm
 * and the CSS rules in globals.css.
 */
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

/**
 * Register the Multi-Channel Ghost Text inline completions provider.
 *
 * CRITICAL — Stale Closure Prevention:
 * All hook state (webLLM, gemini, rag) is read through REFS that are
 * updated via useEffect. This ensures the provider always sees the
 * latest readiness state, not the frozen values from mount time.
 * Refs MUST be updated in useEffect (not during render) per React 19 rules.
 */
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

  // Track the last content-version to cancel stale suggestions
  let contentVersion = 0;
  // ── INP FIX: Throttle provideInlineCompletions ─────────────────
  // Prevents rapid-fire calls that block the main thread.
  let lastProviderCallTime = 0;

  const providerDisposable = monaco.languages.registerInlineCompletionsProvider(
    languageId,
    {
      provideInlineCompletions: async (model, position) => {
        // ── CRITICAL: Wrap entire handler in try-catch ──────────────
        // If any code throws, the promise rejects and Monaco's inline
        // suggestion system may enter a broken state that blocks user
        // input. Always return a valid result.
        try {
          // ── INP FIX: Throttle — skip if called too recently ──────
          const now = performance.now();
          if (now - lastProviderCallTime < PROVIDER_THROTTLE_MS) {
            return { items: [] };
          }
          lastProviderCallTime = now;

          const currentVersion = ++contentVersion;

          const lineText = model.getLineContent(position.lineNumber);
          const prefix = lineText.substring(0, position.column - 1).trim();

          // ── ALWAYS read latest hook state from refs ────────────
          // webLLMRef, geminiRef, ragRef are read in async callbacks below

          // Read source lines from the ref (always up-to-date)
          const sourceLines = sourceLinesRef.current;
          const sourceLine = sourceLines[position.lineNumber - 1]?.trim() ?? "";

          // ── Helper: check if an insertText is a meaningful suggestion ──
          // A suggestion is meaningful only if it:
          //   1. Is non-empty after trimming
          //   2. Does NOT duplicate what the user has already typed (prefix)
          // This prevents Monaco's inline suggestion system from showing
          // duplicate ghost text that blocks or interferes with user input.
          const isMeaningfulSuggestion = (insertText: string): boolean => {
            const trimmedText = insertText.trim();
            if (!trimmedText) return false;
            // If the suggestion is identical to what the user typed, there's
            // nothing to ghost — reject it.
            if (trimmedText === prefix) return false;
            return true;
          };

          // ── Empty source line: check prefetch cache before giving up ──
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

          // Calculate range for ghost text — always empty range
          const range = calculateGhostTextRange(monaco, position);

          // ── Immediate LTE channel (synchronous, <5ms) ──────────────
          const lte = getLTE();
          const lteResult = lte.getSuggestion(sourceLine, prefix);

          const items: languages.InlineCompletion[] = [];

          // ── STRICT: Only add LTE suggestion if it's meaningful ──
          const lteRemainder = lteResult?.remainder?.trim() || "";
          if (lteRemainder && lteRemainder !== prefix) {
            items.push({
              insertText: lteRemainder,
              range,
            });
          }

          // ── Prefetch cache (synchronous) ───────────────────────────
          const { getPrefetch } = usePrefetchStore.getState();
          const cached = getPrefetch(position.lineNumber);

          if (cached && cached.translation.trim()) {
            const cachedRemainder = computeCachedRemainder(cached.translation, prefix);
            // ── STRICT: Only add cache suggestion if meaningful AND no LTE ──
            if (isMeaningfulSuggestion(cachedRemainder) && !lteRemainder) {
              items.push({
                insertText: cachedRemainder,
                range,
              });
            }
          }

          // ── Early exit: if no meaningful items, skip async pipeline ──
          // This prevents unnecessary API calls when we already know
          // the user has typed the full translation.
          if (items.length === 0 && prefix.length > 0) {
            // Check if the prefix covers the full translation from any source
            const lteFull = lteResult?.match;
            if (lteFull && prefix === lteFull.trim()) {
              // User has typed the complete LTE suggestion — nothing more to offer
              return { items: [] };
            }
            if (cached?.translation && prefix === cached.translation.trim()) {
              // User has typed the complete cached suggestion
              return { items: [] };
            }
          }

          // ── Async channels via MonacoSuggestionProvider ─────────────
          suggestionProvider.cancelPending();

          suggestionProvider
            .getSuggestions(sourceLine, prefix, {
              lte: async () => {
                return lteRemainder;
              },
              rag: async () => {
                const ragState = ragRef.current;
                if (!ragState.state.isCorpusLoaded) return "";
                try {
                  const hits = await ragState.search(sourceLine, 1);
                  if (hits.length > 0 && hits[0].ar) {
                    const remainder = computeCachedRemainder(hits[0].ar, prefix);
                    // Only return if meaningful; don't fall back to full translation
                    return isMeaningfulSuggestion(remainder) ? remainder : "";
                  }
                } catch {
                  // RAG timeout — skip
                }
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
                    // Filter: only return if it offers something beyond the prefix
                    const trimmed = result.text.trim();
                    return (trimmed && trimmed !== prefix) ? trimmed : "";
                  }
                } catch {
                  // WebLLM timeout — skip
                }
                return "";
              },
              gemini: async () => {
                const gem = geminiRef.current;
                if (!gem.isAvailable) return "";
                try {
                  const result = await gem.generateBurst(sourceLine, prefix);
                  if (result.text) {
                    const trimmed = result.text.trim();
                    return (trimmed && trimmed !== prefix) ? trimmed : "";
                  }
                } catch {
                  // Gemini timeout — skip
                }
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

              if (bestNew) {
                triggerInlineSuggest(editorRef.current);
              }
            })
            .catch((err) => {
              console.warn("[RDAT Ghost] Async pipeline error:", err);
            });

          return { items };
        } catch (err) {
          console.error("[RDAT Ghost] provideInlineCompletions error:", err);
          return { items: [] };
        }
      },
      freeInlineCompletions: () => {
        // Cleanup
      },
    }
  );

  return providerDisposable;
}

/**
 * Compute the remainder of a cached/Prefetch translation after the user's prefix.
 * Strips the matching prefix portion and returns only what's left to complete.
 *
 * CRITICAL: Returns empty string ("") when there is NO meaningful ghost text
 * to suggest. This prevents Monaco's inline suggestion system from showing
 * duplicate ghost text that blocks or interferes with user input.
 *
 * Rules:
 *  1. If no prefix typed → return full translation (initial ghost text)
 *  2. If prefix matches start of translation → return only the UN-typed remainder
 *  3. If remainder is empty (user typed it all) → return "" (no suggestion)
 *  4. If prefix doesn't match at all → return "" (no suggestion)
 */
function computeCachedRemainder(
  fullTranslation: string,
  typedPrefix: string
): string {
  const trimmed = fullTranslation.trim();
  const prefix = typedPrefix.trim();

  // No prefix typed — return full translation as initial ghost text
  if (!prefix) return trimmed;

  // Exact prefix match — return only the un-typed remainder
  if (trimmed.startsWith(prefix)) {
    const remainder = trimmed.substring(prefix.length).trimStart();
    // CRITICAL: If remainder is empty, the user has already typed the
    // complete translation. Return "" to signal "no suggestion". Do NOT
    // fall back to the full translation — that creates duplicate ghost text.
    return remainder;
  }

  // Prefix doesn't match the start of the translation — no meaningful
  // ghost text to offer. Return "" so the caller skips this suggestion.
  return "";
}

/**
 * Re-trigger Monaco's inline suggestion mechanism.
 */
function triggerInlineSuggest(
  editor: editor.IStandaloneCodeEditor | null
): void {
  if (!editor) return;
  try {
    editor.trigger("rdat-ghost-text", "editor.action.inlineSuggest.trigger", {});
  } catch {
    // Editor may be in a state where triggering isn't possible
  }
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
  resetKey,
}: TargetEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const ghostProviderRef = useRef<IDisposable | null>(null);
  const suggestionProviderRef = useRef<MonacoSuggestionProvider | null>(null);

  // ── Ref for sourceLines so the provider always reads fresh data ──
  const sourceLinesRef = useRef<string[]>(sourceLines);
  // React 19 rule: refs must be updated in useEffect, not during render
  useEffect(() => {
    sourceLinesRef.current = sourceLines;
  }, [sourceLines]);

  // ── Refs for hook state to prevent stale closures ──
  const webLLM = useWebLLM();
  const gemini = useGemini();
  const rag = useRAG();

  const webLLMRef = useRef(webLLM);
  const geminiRef = useRef(gemini);
  const ragRef = useRef(rag);

  // React 19 rule: update refs in useEffect, not during render.
  // These refs are read by the ghost text provider inside
  // provideInlineCompletions (which runs asynchronously in a
  // Monaco microtask), so the useEffect timing is fine — the ref
  // will be updated before the provider reads it.
  useEffect(() => {
    webLLMRef.current = webLLM;
  }, [webLLM]);
  useEffect(() => {
    geminiRef.current = gemini;
  }, [gemini]);
  useEffect(() => {
    ragRef.current = rag;
  }, [rag]);

  // ── Debounce timers ────────────────────────────────────────────
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Theme ────────────────────────────────────────────────────────
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // ══════════════════════════════════════════════════════════════════
  // UNCONTROLLED EDITOR VALUE MANAGEMENT
  //
  // The editor uses UNCONTROLLED mode (defaultValue prop). This avoids
  // the critical bug where @monaco-editor/react's controlled mode
  // (value prop) calls executeEdits() on every render when value
  // doesn't exactly match editor.getValue() — Monaco adds trailing
  // newlines that cause a perpetual mismatch, resetting the cursor
  // and effectively blocking user typing.
  //
  // With uncontrolled mode:
  //  - defaultValue sets the initial content on mount
  //  - The editor manages its own content internally
  //  - onChange propagates changes to the parent
  //  - resetKey forces remount when external changes occur
  //    (e.g., clear, language swap)
  // ══════════════════════════════════════════════════════════════════

  // Stable refs for callbacks used in mount handler
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const onCursorChangeRef = useRef(onCursorChange);
  useEffect(() => { onCursorChangeRef.current = onCursorChange; }, [onCursorChange]);

  // ── Report hook states to parent via refs ─────────────────────
  // React 19 rule: callback refs must be stored in useEffect, not
  // during render. We use a ref for the callback itself so the
  // useEffect doesn't need the callback as a dependency (which would
  // cause unnecessary re-runs when parent re-renders).
  const onWebgpuStateChangeRef = useRef(onWebgpuStateChange);
  const onGeminiAvailableChangeRef = useRef(onGeminiAvailableChange);
  const onRagStateChangeRef = useRef(onRagStateChange);

  useEffect(() => {
    onWebgpuStateChangeRef.current = onWebgpuStateChange;
  }, [onWebgpuStateChange]);
  useEffect(() => {
    onGeminiAvailableChangeRef.current = onGeminiAvailableChange;
  }, [onGeminiAvailableChange]);
  useEffect(() => {
    onRagStateChangeRef.current = onRagStateChange;
  }, [onRagStateChange]);

  // Report WebGPU state to parent
  useEffect(() => {
    onWebgpuStateChangeRef.current?.({
      state: webLLM.state as WebGPUInfo["state"],
      progress: webLLM.progress.percentage > 0 ? webLLM.progress : undefined,
      error: webLLM.error,
    });
  }, [webLLM.state, webLLM.progress, webLLM.error]);

  // Report Gemini availability to parent
  useEffect(() => {
    onGeminiAvailableChangeRef.current?.(gemini.isAvailable);
  }, [gemini.isAvailable]);

  // Report RAG state to parent
  useEffect(() => {
    onRagStateChangeRef.current?.(rag.state);
  }, [rag.state]);

  // Dynamic font family based on direction
  const fontFamily = useMemo(
    () =>
      direction === "rtl"
        ? "'Noto Sans Arabic', 'JetBrains Mono', 'Fira Code', monospace"
        : "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    [direction]
  );

  // Build editor options with dynamic font — memoized to prevent
  // unnecessary re-renders of the Monaco component
  const editorOptions = useMemo(
    () => ({
      ...BASE_EDITOR_OPTIONS,
      fontFamily,
    }),
    [fontFamily]
  );

  // ── Update Monaco theme and font when theme or direction changes ──
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      editorRef.current.updateOptions({
        theme: isDark ? "rdat-dark" : "rdat-light",
        fontFamily,
      });
    }
  }, [isDark, fontFamily]);

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // ── CRITICAL: Ensure editor is editable ────────────────────
      editor.updateOptions({
        readOnly: false,
        theme: isDark ? "rdat-dark" : "rdat-light",
        fontFamily,
      });

      // ── Define custom themes with ghost text foreground color ──
      monaco.editor.defineTheme("rdat-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [],
        colors: {
          "editor.inlineSuggest.foreground": "#64748b",
        },
      });
      monaco.editor.defineTheme("rdat-light", {
        base: "vs",
        inherit: true,
        rules: [],
        colors: {
          "editor.inlineSuggest.foreground": "#94a3b8",
        },
      });

      // ── Register ghost text provider ──────────────────────────
      // Initialize suggestion provider (singleton per editor instance)
      if (!suggestionProviderRef.current) {
        suggestionProviderRef.current = new MonacoSuggestionProvider();
      }

      // Dispose old provider if exists (from previous mount)
      if (ghostProviderRef.current) {
        ghostProviderRef.current.dispose();
      }

      // Register new provider with REF-based access to hook state
      ghostProviderRef.current = registerGhostTextProvider(
        monaco,
        sourceLinesRef,
        webLLMRef,   // Ref, not direct value
        geminiRef,   // Ref, not direct value
        ragRef,      // Ref, not direct value
        suggestionProviderRef.current,
        editorRef
      );

      // ── Initial ghost text trigger on mount ──────────────
      setTimeout(() => {
        triggerInlineSuggest(editor);
      }, 500);

      // ── Trigger ghost text on editor focus ──────────────
      editor.onDidFocusEditorWidget(() => {
        setTimeout(() => {
          triggerInlineSuggest(editor);
        }, 300);
      });

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
      // Context gate ensures normal Tab behavior is preserved
      // when no ghost text is visible.
      editor.addCommand(
        monaco.KeyCode.Tab,
        () => {
          editor.trigger("keyboard", "editor.action.inlineSuggest.commit", {});
        },
        "editorInlineSuggestionVisible"
      );

      // ── Report content changes to parent (uncontrolled) ──
      // INP FIX: Debounce onChange propagation to prevent re-render
      // cascades on every keystroke from blocking the UI.
      let onChangeRaf: number | null = null;
      const contentListener = editor.onDidChangeModelContent(() => {
        // Debounce: use requestAnimationFrame for the first call,
        // then a short timeout for subsequent rapid calls.
        if (onChangeRaf !== null) {
          cancelAnimationFrame(onChangeRaf);
        }
        onChangeRaf = requestAnimationFrame(() => {
          onChangeRaf = null;
          onChangeRef.current?.(editor.getValue());
        });

        webLLMRef.current.interruptGenerate();
        geminiRef.current.interruptGenerate();

        // Cancel any stale suggestion pipeline
        suggestionProviderRef.current?.cancelPending();

        // ── Idle-trigger: Google-like behavior ─────────────────
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
        }
        idleTimerRef.current = setTimeout(() => {
          triggerInlineSuggest(editorRef.current);
          idleTimerRef.current = null;
        }, IDLE_TRIGGER_DELAY_MS);
      });

      // ── Listen to cursor position changes ──────────────────
      // INP FIX: Only propagate cursor changes, don't trigger ghost text
      // on every cursor move — the idle timer from content changes handles that.
      editor.onDidChangeCursorPosition((e) => {
        const lineNumber = e.position.lineNumber;
        onCursorChangeRef.current?.(lineNumber);
      });

      return () => {
        contentListener.dispose();
        if (onChangeRaf !== null) cancelAnimationFrame(onChangeRaf);
      };
    },
    [isDark, fontFamily]
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
      webLLMRef.current.interruptGenerate();
      geminiRef.current.interruptGenerate();
    };
  }, []);

  return (
    <div className={cn("h-full w-full", className)} dir={direction}>
      <MonacoEditor
        key={resetKey ?? "target-editor"}   // remount when resetKey changes
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
