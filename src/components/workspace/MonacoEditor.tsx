"use client";

import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import type { RAGResult } from "@/lib/rag-types";
import { MOCK_INFERENCE_DELAY_MS } from "@/lib/constants";

/**
 * Custom RDAT language IDs for the split-pane architecture.
 * Using separate IDs allows inline completions to be scoped to the
 * target editor only, while the source editor remains clean.
 */
const RDAT_SOURCE_LANGUAGE_ID = "rdat-source";
const RDAT_TARGET_LANGUAGE_ID = "rdat-target";
const RDAT_LANGUAGE_ID = "rdat-translation"; // Legacy fallback

/**
 * Ghost text suggestions for the mock provider.
 * Used as fallback when the real WebLLM is not ready.
 */
const MOCK_SUGGESTIONS = [
  " [AI Suggestion]",
  " ترجمة مقترحة",
  " (Sovereign Track)",
  " — يوصى به",
  " ✓ suggested",
];

function getRandomSuggestion(): string {
  return MOCK_SUGGESTIONS[Math.floor(Math.random() * MOCK_SUGGESTIONS.length)];
}

/**
 * Helper: promisify Monaco's CancellationToken with a timeout.
 * Rejects with "Aborted" if the token fires before the timer resolves.
 */
function waitForDelayOrAbort(
  ms: number,
  token: Monaco.CancellationToken
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (token.isCancellationRequested) {
      reject(new Error("Already cancelled"));
      return;
    }

    const timer = setTimeout(resolve, ms);

    const disposable = token.onCancellationRequested(() => {
      clearTimeout(timer);
      disposable.dispose();
      reject(new Error("Aborted"));
    });
  });
}

/**
 * Completion config stored in a ref to avoid re-registering the provider.
 */
interface CompletionConfig {
  generateCompletion?: (editorText: string, ragResults: RAGResult[]) => Promise<string | null>;
  interruptGeneration?: () => void;
  ragResults: RAGResult[];
  isLLMReady: boolean;
}

/**
 * Cursor position callback for tracking the active line
 * in the target editor (used to extract the corresponding source line).
 */
interface CursorPosition {
  lineNumber: number;
  column: number;
}

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  generateCompletion?: (editorText: string, ragResults: RAGResult[]) => Promise<string | null>;
  interruptGeneration?: () => void;
  ragResults?: RAGResult[];
  isLLMReady?: boolean;
  onEditorDidMount?: (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => void;
  /** Whether the editor is read-only (used for source pane) */
  readOnly?: boolean;
  /** Whether to enable inline completions / ghost text (disabled for source pane) */
  enableCompletions?: boolean;
  /** Custom language ID — defaults to rdat-target for active editing */
  languageId?: string;
  /** Callback when cursor position changes (used to track active line for RAG) */
  onCursorPositionChange?: (position: CursorPosition) => void;
  /** Optional className for the editor wrapper */
  className?: string;
  /** Line number to highlight (used for cross-editor active sentence tracking) */
  highlightLine?: number;
}

/**
 * Injects a style tag for the source editor line highlight decoration.
 * Called once on module load.
 */
let styleInjected = false;
function injectHighlightStyle() {
  if (styleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `.rdat-source-highlight { background: rgba(45, 212, 191, 0.08) !important; }`;
  document.head.appendChild(style);
  styleInjected = true;
}

/**
 * MonacoEditor — A thin wrapper around @monaco-editor/react configured
 * for the RDAT Copilot translation IDE.
 *
 * Supports the split-pane CAT architecture:
 * - Source pane: readOnly, no completions, rdat-source language
 * - Target pane: active editing, inline completions, rdat-target language
 *
 * Key features:
 * - vs-dark theme, wordWrap on, minimap off, fontSize 16
 * - automaticLayout for seamless resize within WorkspaceShell
 * - Inline completions provider: real WebLLM when ready, mock fallback
 * - Cursor position tracking for source line extraction
 * - Cross-editor line highlighting via deltaDecorations
 * - Proper disposal of providers and editor on unmount
 */
export function MonacoEditor({
  value,
  onChange,
  generateCompletion,
  interruptGeneration,
  ragResults = [],
  isLLMReady = false,
  onEditorDidMount,
  readOnly = false,
  enableCompletions = true,
  languageId,
  onCursorPositionChange,
  className,
  highlightLine,
}: MonacoEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const inlineProviderRef = useRef<Monaco.IDisposable | null>(null);
  const cursorDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const highlightDecorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | string[]>([]);

  // Inject the highlight style on first render
  useEffect(() => {
    injectHighlightStyle();
  }, []);

  // Resolve the language ID
  const resolvedLanguageId = languageId || (enableCompletions ? RDAT_TARGET_LANGUAGE_ID : RDAT_SOURCE_LANGUAGE_ID);

  // Store completion config in a ref so the provider callback always
  // has the latest values without needing re-registration
  const completionConfigRef = useRef<CompletionConfig>({
    generateCompletion,
    interruptGeneration,
    ragResults,
    isLLMReady,
  });

  useEffect(() => {
    completionConfigRef.current = {
      generateCompletion,
      interruptGeneration,
      ragResults,
      isLLMReady,
    };
  }, [generateCompletion, interruptGeneration, ragResults, isLLMReady]);

  // Store cursor callback in a ref
  const onCursorChangeRef = useRef(onCursorPositionChange);
  useEffect(() => {
    onCursorChangeRef.current = onCursorPositionChange;
  }, [onCursorPositionChange]);

  /**
   * beforeMount — Register the language and inline completions provider.
   * Only registers completions for the TARGET editor (enableCompletions=true).
   * This runs once before the editor DOM is created.
   */
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    try {
      // Register the custom language ID
      if (monaco?.languages?.register) {
        monaco.languages.register({ id: resolvedLanguageId });
      }

      // Skip provider registration for source pane
      if (!enableCompletions) {
        console.log(`[RDAT] Source editor mounted (language: ${resolvedLanguageId}) — completions disabled`);
        return;
      }

      // Guard: ensure Monaco API is fully loaded before registering providers
      if (
        !monaco?.languages ||
        typeof monaco.languages.registerInlineCompletionsProvider !== "function"
      ) {
        console.warn("[RDAT] Monaco inline completions API not available — ghost text disabled");
        return;
      }

      inlineProviderRef.current = monaco.languages.registerInlineCompletionsProvider(
        resolvedLanguageId,
        {
          provideInlineCompletions: async (
            model: Monaco.editor.ITextModel,
            position: Monaco.Position,
            _context: Monaco.InlineCompletionContext,
            token: Monaco.CancellationToken
          ): Promise<Monaco.languages.InlineCompletions<Monaco.languages.InlineCompletion>> => {
            console.log(
              `[RDAT] Ghost text provider called at line ${position.lineNumber}, col ${position.column}`
            );

            const config = completionConfigRef.current;

            // If LLM is not ready, fall back to mock
            if (!config.isLLMReady || !config.generateCompletion) {
              try {
                await waitForDelayOrAbort(MOCK_INFERENCE_DELAY_MS, token);

                const suggestion = getRandomSuggestion();
                console.log(`[RDAT] Ghost text delivered (mock): "${suggestion}"`);

                return {
                  items: [
                    {
                      insertText: suggestion,
                      range: {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column,
                      },
                    },
                  ],
                };
              } catch (_err) {
                console.log(
                  `[RDAT] Ghost text generation cancelled — user typed during ${MOCK_INFERENCE_DELAY_MS}ms window`
                );
                return { items: [] };
              }
            }

            // ── Real WebLLM generation path ──
            try {
              if (token.isCancellationRequested) {
                throw new Error("Already cancelled");
              }

              // Set up abort handler for the cancellation token
              let cancelled = false;
              const disposable = token.onCancellationRequested(() => {
                cancelled = true;
                config.interruptGeneration?.();
                disposable.dispose();
              });

              // Get current editor text
              const text = model.getValue();

              // Generate completion using WebLLM + RAG context
              const generatedText = await config.generateCompletion(text, config.ragResults);

              if (cancelled) {
                console.log("[RDAT] Ghost text cancelled after generation");
                return { items: [] };
              }

              if (generatedText && generatedText.trim().length > 0) {
                console.log(`[RDAT] Ghost text delivered (WebLLM): "${generatedText.substring(0, 50)}…"`);
                return {
                  items: [
                    {
                      insertText: generatedText.trim(),
                      range: {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column,
                      },
                    },
                  ],
                };
              }

              return { items: [] };
            } catch (_err) {
              console.log("[RDAT] Ghost text generation cancelled — user typed during inference");
              return { items: [] };
            }
          },

          freeInlineCompletions: () => {
            // No-op: we don't cache completions.
          },
        }
      );
    } catch (err) {
      console.warn("[RDAT] Failed to register inline completions provider:", err);
    }
  }, [resolvedLanguageId, enableCompletions]);

  /**
   * onMount — Capture the editor reference for imperative control.
   * Sets up cursor tracking for source line extraction.
   */
  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure inline completions to show automatically (target only)
    if (enableCompletions) {
      editor.updateOptions({
        inlineSuggest: {
          enabled: true,
        },
      });
    }

    // Track cursor position changes (for RAG source line extraction)
    if (onCursorChangeRef.current) {
      cursorDisposableRef.current = editor.onDidChangeCursorPosition((e) => {
        onCursorChangeRef.current?.({
          lineNumber: e.position.lineNumber,
          column: e.position.column,
        });
      });
    }

    console.log(
      `[RDAT] Monaco editor mounted (language: ${resolvedLanguageId}, readOnly: ${readOnly}) — ${enableCompletions ? "inline completions active" : "completions disabled"}`
    );
    onEditorDidMount?.(editor, monaco);
  }, [onEditorDidMount, resolvedLanguageId, readOnly, enableCompletions]);

  /**
   * Update highlight decoration when highlightLine changes.
   * Uses deltaDecorations to add/remove the active line highlight.
   */
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    if (highlightLine === undefined || highlightLine <= 0) {
      // Clear all highlight decorations
      const oldDecorations = highlightDecorationsRef.current;
      if (Array.isArray(oldDecorations) && oldDecorations.length > 0) {
        highlightDecorationsRef.current = editor.deltaDecorations(oldDecorations, []);
      }
      return;
    }

    const newDecorations: Monaco.editor.IModelDeltaDecoration[] = [
      {
        range: {
          startLineNumber: highlightLine,
          startColumn: 1,
          endLineNumber: highlightLine,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: "rdat-source-highlight",
          overviewRuler: {
            color: "#2dd4bf",
            position: monaco.editor.OverviewRulerLane.Full,
          },
        },
      },
    ];

    const oldDecorations = highlightDecorationsRef.current;
    highlightDecorationsRef.current = editor.deltaDecorations(
      Array.isArray(oldDecorations) ? oldDecorations : [],
      newDecorations
    );
  }, [highlightLine]);

  /**
   * Cleanup: Dispose of the inline provider, cursor tracker, and editor on unmount.
   */
  useEffect(() => {
    return () => {
      console.log(`[RDAT] Monaco editor unmounting (language: ${resolvedLanguageId}) — disposing resources`);

      if (inlineProviderRef.current) {
        inlineProviderRef.current.dispose();
        inlineProviderRef.current = null;
      }

      if (cursorDisposableRef.current) {
        cursorDisposableRef.current.dispose();
        cursorDisposableRef.current = null;
      }

      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, [resolvedLanguageId]);

  return (
    <Editor
      height="100%"
      language={resolvedLanguageId}
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      loading={
        <div className="flex items-center justify-center h-full bg-[var(--ide-bg-primary)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
            <span className="text-sm text-[var(--ide-text-muted)]">
              Loading Monaco Editor…
            </span>
          </div>
        </div>
      }
      options={{
        // ─── Typography ─────────────────────────────
        fontSize: 16,
        fontFamily: "'Geist Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontLigatures: true,
        lineHeight: 24,

        // ─── Layout ─────────────────────────────────
        wordWrap: "on",
        wordWrapColumn: 80,
        minimap: { enabled: false },
        padding: { top: 16, bottom: 16 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        automaticLayout: true,

        // ─── Appearance ─────────────────────────────
        renderLineHighlight: "line",
        renderWhitespace: "selection",
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        bracketPairColorization: {
          enabled: true,
        },

        // ─── Behavior ──────────────────────────────
        readOnly,
        inlineSuggest: {
          enabled: enableCompletions,
        },
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        acceptSuggestionOnEnter: "on",
        tabSize: 2,
        insertSpaces: true,
        domReadOnly: readOnly,

        // ─── IDE Chrome ─────────────────────────────
        lineNumbers: "on",
        glyphMargin: !readOnly, // Only show glyph margin for active editor
        folding: !readOnly,     // Disable folding for readOnly
        lineDecorationsWidth: 8,
        lineNumbersMinChars: 3,
        scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
          vertical: "auto",
          horizontal: "auto",
        },

        // ─── Source Pane Styling ────────────────────
        ...(readOnly && {
          renderLineHighlight: "none",
          cursorBlinking: "smooth" as const,
          contextmenu: true, // Allow paste via context menu
        }),
      }}
      className={className}
    />
  );
}
