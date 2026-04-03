"use client";

import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import type { RAGResult } from "@/lib/rag-types";
import { MOCK_INFERENCE_DELAY_MS } from "@/lib/constants";

/**
 * Custom RDAT language ID for the inline completions provider.
 * Using "plaintext" works universally, but a custom ID lets us
 * scope providers cleanly in later phases.
 */
const RDAT_LANGUAGE_ID = "rdat-translation";

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

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  generateCompletion?: (editorText: string, ragResults: RAGResult[]) => Promise<string | null>;
  interruptGeneration?: () => void;
  ragResults?: RAGResult[];
  isLLMReady?: boolean;
  onEditorDidMount?: (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => void;
}

/**
 * MonacoEditor — A thin wrapper around @monaco-editor/react configured
 * for the RDAT Copilot translation IDE.
 *
 * Key features:
 * - vs-dark theme, wordWrap on, minimap off, fontSize 16
 * - automaticLayout for seamless resize within WorkspaceShell
 * - Inline completions provider: real WebLLM when ready, mock fallback
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
}: MonacoEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const inlineProviderRef = useRef<Monaco.IDisposable | null>(null);

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

  /**
   * beforeMount — Register the inline completions provider.
   * This runs once before the editor DOM is created.
   */
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    // Register a custom language so the provider is scoped cleanly
    monaco.languages.register({ id: RDAT_LANGUAGE_ID });

    inlineProviderRef.current = monaco.languages.registerInlineCompletionsProvider(
      RDAT_LANGUAGE_ID,
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

          // If LLM is not ready, fall back to mock (Phase 2 behavior)
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
  }, []);

  /**
   * onMount — Capture the editor reference for imperative control.
   */
  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Configure inline completions to show automatically
    editor.updateOptions({
      inlineSuggest: {
        enabled: true,
      },
    });

    console.log("[RDAT] Monaco editor mounted — inline completions provider active");
    onEditorDidMount?.(editor, monaco);
  }, [onEditorDidMount]);

  /**
   * Cleanup: Dispose of the inline provider and editor instance on unmount.
   */
  useEffect(() => {
    return () => {
      console.log("[RDAT] Monaco editor unmounting — disposing resources");

      if (inlineProviderRef.current) {
        inlineProviderRef.current.dispose();
        inlineProviderRef.current = null;
      }

      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, []);

  return (
    <Editor
      height="100%"
      language={RDAT_LANGUAGE_ID}
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
        inlineSuggest: {
          enabled: true,
        },
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        acceptSuggestionOnEnter: "on",
        tabSize: 2,
        insertSpaces: true,

        // ─── IDE Chrome ─────────────────────────────
        lineNumbers: "on",
        glyphMargin: true,
        folding: true,
        lineDecorationsWidth: 8,
        lineNumbersMinChars: 3,
        scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
          vertical: "auto",
          horizontal: "auto",
        },
      }}
    />
  );
}
