"use client";

import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { MOCK_INFERENCE_DELAY_MS } from "@/lib/constants";

/**
 * Custom RDAT language ID for the inline completions provider.
 * Using "plaintext" works universally, but a custom ID lets us
 * scope providers cleanly in later phases.
 */
const RDAT_LANGUAGE_ID = "rdat-translation";

/**
 * Ghost text suggestions for the mock provider.
 * In Phase 4+, these will come from the real Sovereign Track (WebGPU Gemma 4).
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

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * MonacoEditor — A thin wrapper around @monaco-editor/react configured
 * for the RDAT Copilot translation IDE.
 *
 * Key features:
 * - vs-dark theme, wordWrap on, minimap off, fontSize 16
 * - automaticLayout for seamless resize within WorkspaceShell
 * - Mock inlineCompletionsProvider for ghost text (Phase 2 scaffolding)
 * - Proper disposal of providers and editor on unmount
 */
export function MonacoEditor({ value, onChange }: MonacoEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const inlineProviderRef = useRef<Monaco.IDisposable | null>(null);

  /**
   * beforeMount — Register the mock inline completions provider.
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

          try {
            // Simulate the inference delay — if user types during this window,
            // Monaco's CancellationToken fires and we reject immediately.
            await waitForDelayOrAbort(MOCK_INFERENCE_DELAY_MS, token);

            const suggestion = getRandomSuggestion();
            console.log(`[RDAT] Ghost text delivered: "${suggestion}"`);

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
                  // Optional: add a command that fires when the user accepts
                  // the ghost text (Tab key). Will be wired in Phase 4.
                },
              ],
            };
          } catch (err) {
            // Token was cancelled — user typed during the 1500ms window.
            // This is the expected "Latency Trap" behavior.
            console.log(
              `[RDAT] Ghost text generation cancelled — user typed during ${MOCK_INFERENCE_DELAY_MS}ms window`
            );
            return { items: [] };
          }
        },

        freeInlineCompletions: () => {
          // No-op: we don't cache completions in the mock provider.
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
  }, []);

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
