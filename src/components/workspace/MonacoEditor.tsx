"use client";

import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import type { RAGResult } from "@/lib/rag-types";
import type { SuggestionMode, LanguageDirection } from "@/types";
import type { TranslationVersions, TranslationCache } from "@/hooks/usePredictiveTranslation";
import { LANGUAGE_PAIRS } from "@/lib/constants";

/**
 * Custom RDAT language IDs for the split-pane architecture.
 * Using separate IDs allows features to be scoped to the
 * target editor only, while the source editor remains clean.
 */
const RDAT_SOURCE_LANGUAGE_ID = "rdat-source";
const RDAT_TARGET_LANGUAGE_ID = "rdat-target";

// ─── Style Injection ────────────────────────────────────────────────────

let editorStyleInjected = false;
function injectEditorStyles() {
  if (editorStyleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `
    .rdat-source-highlight {
      background: rgba(45, 212, 191, 0.08) !important;
    }

    .rdat-version-hint-line {
      background: rgba(45, 212, 191, 0.04);
    }
  `;
  document.head.appendChild(style);
  editorStyleInjected = true;
}

// ─── Suggestion Computation ─────────────────────────────────────────────

/**
 * computeSuggestionDisplay — Given the user's current line text and the
 * cached translation versions, compute what to show.
 *
 * Dynamic Prefix Matching:
 * - If the user's text starts with the beginning of a cached version,
 *   show only the REMAINDER (the part not yet typed).
 * - If the user deviates entirely, show the full versions.
 * - If no cache hit, return null.
 */
function computeSuggestionDisplay(
  currentLineText: string,
  versions: TranslationVersions
): { version1Remainder: string; version2Remainder: string; version1Full: string; version2Full: string; isPrefixMatch: boolean } | null {
  if (!versions || !Array.isArray(versions) || (versions as unknown[]).length < 2) return null;

  const trimmedLine = (currentLineText ?? "").trim();
  const v1Full = String(versions[0] ?? "");
  const v2Full = String(versions[1] ?? "");

  // If the line is empty, show both full versions
  if (!trimmedLine || (trimmedLine?.length ?? 0) === 0 || !v1Full || !v2Full) {
    return {
      version1Remainder: v1Full,
      version2Remainder: v2Full,
      version1Full: v1Full,
      version2Full: v2Full,
      isPrefixMatch: false,
    };
  }

  // Try prefix matching against each version
  const v1Match = tryPrefixMatch(trimmedLine ?? "", v1Full);
  const v2Match = tryPrefixMatch(trimmedLine ?? "", v2Full);

  // Determine the best match
  const v1IsPrefix = v1Match !== null;
  const v2IsPrefix = v2Match !== null;

  if (v1IsPrefix || v2IsPrefix) {
    return {
      version1Remainder: v1IsPrefix ? v1Match! : v1Full,
      version2Remainder: v2IsPrefix ? v2Match! : v2Full,
      version1Full: v1Full,
      version2Full: v2Full,
      isPrefixMatch: true,
    };
  }

  // No prefix match — show full versions (user may be going a different direction)
  return {
    version1Remainder: v1Full,
    version2Remainder: v2Full,
    version1Full: v1Full,
    version2Full: v2Full,
    isPrefixMatch: false,
  };
}

/**
 * tryPrefixMatch — Checks if the user's current text is a prefix of the
 * cached version. Returns the remainder if matched, or null if no match.
 *
 * Handles slight variations (whitespace normalization, partial word matching).
 */
function tryPrefixMatch(userText: string | null | undefined, fullVersion: string | null | undefined): string | null {
  const safeUser = String(userText ?? "");
  const safeFull = String(fullVersion ?? "");
  if (!safeUser || !safeFull) return null;

  // Normalize for comparison
  const normalizedUser = safeUser.replace(/\s+/g, " ").trim();
  const normalizedFull = safeFull.replace(/\s+/g, " ").trim();

  // Direct prefix check
  if (normalizedFull.startsWith(normalizedUser)) {
    const remainder = normalizedFull.substring(normalizedUser.length ?? 0).trim();
    return (remainder?.length ?? 0) > 0 ? remainder : null;
  }

  // Partial last-word matching: the user might be in the middle of typing
  // the last word. Check if the user text matches up to a word boundary
  // in the full version.
  const userWords = normalizedUser.split(" ");
  const fullWords = normalizedFull.split(" ");

  if ((userWords?.length ?? 0) > (fullWords?.length ?? 0)) return null;

  // Check if all complete words match
  let matched = true;
  for (let i = 0; i < (userWords?.length ?? 0) - 1; i++) {
    if (i >= (fullWords?.length ?? 0) || userWords[i] !== fullWords[i]) {
      matched = false;
      break;
    }
  }

  if (matched && userWords.length > 0) {
    const lastUserWord = userWords[(userWords?.length ?? 0) - 1];
    const correspondingFullWord = fullWords[(userWords?.length ?? 0) - 1];

    if (correspondingFullWord && correspondingFullWord.startsWith(lastUserWord)) {
      // Build remainder: rest of the current word + remaining words
      const restOfCurrentWord = correspondingFullWord.substring(lastUserWord?.length ?? 0);
      const remainingWords = fullWords.slice(userWords?.length ?? 0);
      const remainder = [restOfCurrentWord, ...remainingWords].join(" ").trim();
      return (remainder?.length ?? 0) > 0 ? remainder : null;
    }
  }

  return null;
}

function escapeHtml(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Props ──────────────────────────────────────────────────────────────

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
  isGeminiReady?: boolean;
  onEditorDidMount?: (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => void;
  readOnly?: boolean;
  enableCompletions?: boolean;
  languageId?: string;
  onCursorPositionChange?: (position: CursorPosition) => void;
  className?: string;
  highlightLine?: number;
  onSuggestionModeChange?: (mode: SuggestionMode) => void;
  languageDirection?: LanguageDirection;

  // ── Predictive Translation Props (5-Channel Ghost Text) ──
  /** Cached translation versions from the predictive prefetch engine (Channel 3) */
  translationCache?: TranslationCache;
  /** Incremented each time the cache is updated (Channel 3) */
  cacheVersion?: number;
  /** Whether the prefetch engine is currently generating (Channel 3) */
  isPrefetching?: boolean;
  /** Get cached versions for a given source sentence (Channel 3) */
  getCachedVersions?: (sourceSentence: string) => TranslationVersions | null;
  /** Active source sentence for the current target line (Channel 3) */
  activeSourceSentence?: string;
  /** Channel 5 burst suggestion (3-5 word continuation) */
  burstSuggestion?: string | null;
  /** Ref to burst suggestion for inline completions provider */
  burstSuggestionRef?: React.RefObject<string | null>;
}

// ─── Component ──────────────────────────────────────────────────────────

/**
 * MonacoEditor — A thin wrapper around @monaco-editor/react configured
 * for the RDAT Copilot translation IDE.
 *
 * v5.0 — Dual-Channel Ghost Text Architecture:
 * - Primary Channel: registerInlineCompletionsProvider for ghost text (Tab to accept)
 * - Secondary Channel: deltaDecorations with "after" content for version labels
 * - No ViewZone, no custom Tab keybinding (Monaco handles inline completions natively)
 * - Prefetch manages its own lifecycle based on activeTargetLine changes
 */
export function MonacoEditor({
  value,
  onChange,
  generateCompletion,
  interruptGeneration,
  ragResults = [],
  isLLMReady = false,
  isGeminiReady = false,
  onEditorDidMount,
  readOnly = false,
  enableCompletions = true,
  languageId,
  onCursorPositionChange,
  className,
  highlightLine,
  onSuggestionModeChange,
  languageDirection = "en-ar",
  // Predictive Translation props
  translationCache,
  cacheVersion = 0,
  isPrefetching = false,
  getCachedVersions,
  activeSourceSentence,
  // Channel 5 burst continuation
  burstSuggestion,
  burstSuggestionRef,
}: MonacoEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const cursorDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const highlightDecorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | string[]>([]);

  // ── Inline Completions Provider disposable ──────────────────────────
  const inlineProviderDisposableRef = useRef<Monaco.IDisposable | null>(null);

  // ── Version decoration (secondary channel) ─────────────────────────
  const versionDecorationsRef = useRef<string[]>([]);

  // ── Cursor position change disposable (for version decoration) ────
  const versionCursorDisposableRef = useRef<Monaco.IDisposable | null>(null);

  // Inject styles on first render
  useEffect(() => {
    injectEditorStyles();
  }, []);

  // Resolve the language ID
  const resolvedLanguageId = languageId || (enableCompletions ? RDAT_TARGET_LANGUAGE_ID : RDAT_SOURCE_LANGUAGE_ID);

  // Store callbacks in refs
  const onCursorChangeRef = useRef(onCursorPositionChange);
  useEffect(() => { onCursorChangeRef.current = onCursorPositionChange; }, [onCursorPositionChange]);

  const onSuggestionModeChangeRef = useRef(onSuggestionModeChange);
  useEffect(() => { onSuggestionModeChangeRef.current = onSuggestionModeChange; }, [onSuggestionModeChange]);

  const getCachedVersionsRef = useRef(getCachedVersions);
  useEffect(() => { getCachedVersionsRef.current = getCachedVersions; }, [getCachedVersions]);

  const activeSourceSentenceRef = useRef(activeSourceSentence);
  useEffect(() => { activeSourceSentenceRef.current = activeSourceSentence; }, [activeSourceSentence]);

  const isPrefetchingRef = useRef(isPrefetching);
  useEffect(() => { isPrefetchingRef.current = isPrefetching; }, [isPrefetching]);

  const languageDirectionRef = useRef(languageDirection);
  useEffect(() => { languageDirectionRef.current = languageDirection; }, [languageDirection]);

  const burstSuggestionLocalRef = useRef(burstSuggestion);
  useEffect(() => { burstSuggestionLocalRef.current = burstSuggestion; }, [burstSuggestion]);

  // ─── Version Decoration Updater (Secondary Channel) ─────────────────

  const updateVersionDecoration = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      const pos = editor.getPosition();
      if (!pos) return;

      const sourceSentence = activeSourceSentenceRef.current || "";
      const versions = getCachedVersionsRef.current?.(sourceSentence);
      const prefetching = isPrefetchingRef.current;

      let afterText = "";
      if (versions && versions.length >= 2) {
        const v1 = (versions[0] || "").substring(0, 50);
        const v2 = (versions[1] || "").substring(0, 50);
        afterText = `  ┃ [Tab] ${v1}  ┃ [Ctrl+Tab] ${v2}`;
      } else if (prefetching) {
        afterText = "  ┃ ⏳ Predicting (N+3)…";
      }

      versionDecorationsRef.current = editor.deltaDecorations(
        versionDecorationsRef.current,
        afterText ? [{
          range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
          options: {
            isWholeLine: true,
            after: { content: afterText },
            className: "rdat-version-hint-line",
          },
        }] : []
      );
    },
    []
  );

  // ─── Update version decoration when cache/prefetching changes ──────

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !enableCompletions) return;

    const timer = setTimeout(() => {
      try {
        if (editorRef.current && monacoRef.current) {
          updateVersionDecoration(editorRef.current, monacoRef.current);
        }
      } catch {
        // Editor may have been disposed
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [cacheVersion, isPrefetching, updateVersionDecoration, enableCompletions]);

  // ─── beforeMount ─────────────────────────────────────────────────────

  const handleBeforeMount: BeforeMount = useCallback(
    (monaco) => {
      try {
        if (monaco?.languages?.register) {
          monaco.languages.register({ id: resolvedLanguageId });
        }
      } catch (err) {
        console.warn("[RDAT] beforeMount error:", err);
      }
    },
    [resolvedLanguageId]
  );

  // ─── onMount ─────────────────────────────────────────────────────────

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      if (enableCompletions) {
        // ── PRIMARY CHANNEL: Inline Completions Provider ──
        // Enable inline suggestions in editor options
        editor.updateOptions({
          inlineSuggest: {
            enabled: true,
          },
        });

        const inlineProviderDisposable = monaco.languages.registerInlineCompletionsProvider(
          resolvedLanguageId,
          {
            provideInlineCompletions: async (model, position, context, token) => {
              // ═══════════════════════════════════════════════════════════
              // CHANNEL 5 PRIORITY: Burst Suggestion (3-5 word continuation)
              // ═══════════════════════════════════════════════════════════
              const burst = burstSuggestionRef?.current ?? burstSuggestionLocalRef.current;
              if (burst && burst.trim()) {
                const lineContent = model.getLineContent(position.lineNumber) || "";
                const textBeforeCursor = lineContent.substring(0, position.column - 1);
                const normalizedTyped = textBeforeCursor.replace(/\s+/g, " ").trim();
                const normalizedBurst = burst.replace(/\s+/g, " ").trim();

                // Ensure we don't duplicate text the user already typed
                let burstInsert = normalizedBurst;
                if (normalizedTyped && normalizedBurst.startsWith(normalizedTyped)) {
                  const remainder = normalizedBurst.substring(normalizedTyped.length).trim();
                  if (remainder) burstInsert = remainder;
                  else return { items: [] }; // User already typed the full burst
                }

                console.log("[RDAT Debug] Channel 5 burst ghost text:", burstInsert.substring(0, 60));

                return {
                  items: [{
                    insertText: burstInsert,
                    range: new monaco.Range(
                      position.lineNumber,
                      position.column,
                      position.lineNumber,
                      position.column
                    ),
                    filterText: burst,
                    completionInfo: {
                      providerId: "rdat-burst",
                      label: "[Tab] Autocomplete"
                    }
                  }]
                };
              }

              // ═══════════════════════════════════════════════════════════
              // CHANNEL 3 FALLBACK: Cached full translation (prefix match)
              // ═══════════════════════════════════════════════════════════
              const sourceSentence = activeSourceSentenceRef.current || "";
              const versions = getCachedVersionsRef.current?.(sourceSentence);
              if (!versions || versions.length < 2) return { items: [] };

              const lineContent = model.getLineContent(position.lineNumber) || "";
              const textBeforeCursor = lineContent.substring(0, position.column - 1);

              const v1Full = versions[0] || "";
              const v2Full = versions[1] || "";

              // Compute remainder based on prefix match
              let insertText = v1Full;
              if (textBeforeCursor.trim() && v1Full) {
                const normalizedTyped = textBeforeCursor.replace(/\s+/g, " ").trim();
                const normalizedFull = v1Full.replace(/\s+/g, " ").trim();
                if (normalizedFull.startsWith(normalizedTyped)) {
                  const remainder = normalizedFull.substring(normalizedTyped.length).trim();
                  if (remainder) insertText = remainder;
                }
              }

              if (!insertText.trim()) return { items: [] };

              console.log("[RDAT Debug] Channel 3 cached ghost text:", insertText.substring(0, 60));

              return {
                items: [{
                  insertText: insertText,
                  range: new monaco.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column
                  ),
                  filterText: v1Full,
                  completionInfo: {
                    providerId: "rdat-predictive",
                    label: "[Tab] Formal"
                  }
                }]
              };
            },
            freeInlineCompletions: () => {}
          }
        );

        inlineProviderDisposableRef.current = inlineProviderDisposable;

        // ── SECONDARY CHANNEL: Version decoration on cursor move ──
        versionCursorDisposableRef.current = editor.onDidChangeCursorPosition(() => {
          updateVersionDecoration(editor, monaco);
        });

        // Initial version decoration
        setTimeout(() => {
          try {
            if (editor.getModel() !== null) {
              updateVersionDecoration(editor, monaco);
            }
          } catch {
            // Editor may have been disposed
          }
        }, 500);

        console.log(
          "[RDAT] Target editor mounted — Dual-Channel Ghost Text active (v5.0)"
        );
      }

      // Track cursor position changes for source line extraction
      if (onCursorChangeRef.current) {
        cursorDisposableRef.current = editor.onDidChangeCursorPosition((e) => {
          onCursorChangeRef.current?.({
            lineNumber: e.position.lineNumber,
            column: e.position.column,
          });
        });
      }

      console.log(
        `[RDAT] Monaco editor mounted (language: ${resolvedLanguageId}, readOnly: ${readOnly})`
      );
      onEditorDidMount?.(editor, monaco);
    },
    [
      onEditorDidMount,
      resolvedLanguageId,
      readOnly,
      enableCompletions,
      updateVersionDecoration,
    ]
  );

  // ─── Highlight Decoration ────────────────────────────────────────────

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    if (highlightLine === undefined || highlightLine <= 0) {
      const oldDecorations = highlightDecorationsRef.current;
      if (Array.isArray(oldDecorations) && (oldDecorations?.length ?? 0) > 0) {
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

  // ─── Channel 5: Trigger inline suggestions when burst arrives ──
  useEffect(() => {
    if (!burstSuggestion || !editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    // Force Monaco to re-evaluate inline completions when burst suggestion arrives
    // by moving the cursor to trigger a re-evaluation cycle
    const pos = editor.getPosition();
    if (!pos) return;

    try {
      // Trigger inline suggestion action (available in Monaco >= 0.40)
      const action = editor.getAction("editor.action.inlineSuggest.trigger");
      if (action) {
        action.run();
        console.log("[RDAT Debug] Channel 5: triggered inline suggestion refresh");
      } else {
        // Fallback: simulate a cursor nudge to force re-evaluation
        editor.setPosition(new monaco.Position(pos.lineNumber, pos.column));
      }
    } catch {
      // Silent fail — the provider will be called on next user interaction
    }
  }, [burstSuggestion]);

  // ─── Cleanup ─────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      console.log(
        `[RDAT] Monaco editor unmounting (language: ${resolvedLanguageId}) — disposing resources`
      );

      // Dispose inline completions provider
      if (inlineProviderDisposableRef.current) {
        inlineProviderDisposableRef.current.dispose();
        inlineProviderDisposableRef.current = null;
      }

      // Dispose version cursor listener
      if (versionCursorDisposableRef.current) {
        versionCursorDisposableRef.current.dispose();
        versionCursorDisposableRef.current = null;
      }

      // Dispose cursor listener
      if (cursorDisposableRef.current) {
        cursorDisposableRef.current.dispose();
        cursorDisposableRef.current = null;
      }

      // Dispose editor
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, [resolvedLanguageId]);

  // ─── Render ──────────────────────────────────────────────────────────

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
        // For target pane: enable inline suggestions (primary ghost text channel)
        // For source pane: disable
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
        glyphMargin: !readOnly,
        folding: !readOnly,
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
          contextmenu: true,
        }),
      }}
      className={className}
    />
  );
}
