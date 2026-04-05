"use client";

import { useRef, useCallback, useEffect, useState } from "react";
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

// ─── ViewZone Suggestion Widget Types ───────────────────────────────────

interface ViewZoneHandle {
  zoneId: string | null;
  domNode: HTMLElement | null;
}

interface SuggestionDisplay {
  version1Remainder: string;
  version2Remainder: string;
  version1Full: string;
  version2Full: string;
  isPrefixMatch: boolean;
}

// ─── Style Injection ────────────────────────────────────────────────────

let viewZoneStyleInjected = false;
function injectViewZoneStyles() {
  if (viewZoneStyleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `
    .rdat-source-highlight {
      background: rgba(45, 212, 191, 0.08) !important;
    }

    /* ── Predictive Zone Widget ───────────────────────────── */
    .rdat-predictive-zone {
      padding: 6px 0 6px 52px;
      font-family: 'Geist Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 13px;
      line-height: 1.6;
      color: #64748b;
      pointer-events: none;
      user-select: none;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow: hidden;
    }

    .rdat-predictive-zone dir="auto" {
      unicode-bidi: plaintext;
    }

    .rdat-suggestion-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 1px 0;
    }

    .rdat-suggestion-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.03em;
      flex-shrink: 0;
      min-width: 100px;
    }

    .rdat-suggestion-label--formal {
      color: #f59e0b;
    }

    .rdat-suggestion-label--natural {
      color: #38bdf8;
    }

    .rdat-suggestion-text {
      color: #64748b;
      opacity: 0.8;
    }

    .rdat-suggestion-text--prefix-match {
      color: #a78bfa;
      opacity: 1;
    }

    .rdat-suggestion-text--empty {
      color: #475569;
      font-style: italic;
      opacity: 0.5;
    }

    .rdat-prefetch-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #475569;
      font-size: 11px;
      padding: 2px 0;
    }

    .rdat-prefetch-spinner {
      width: 12px;
      height: 12px;
      border: 1.5px solid #475569;
      border-top-color: #2dd4bf;
      border-radius: 50%;
      animation: rdat-spin 0.8s linear infinite;
    }

    @keyframes rdat-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  viewZoneStyleInjected = true;
}

// ─── Suggestion Computation ─────────────────────────────────────────────

/**
 * computeSuggestionDisplay — Given the user's current line text and the
 * cached translation versions, compute what to show in the ViewZone.
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
): SuggestionDisplay | null {
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

  if (userWords.length > fullWords.length) return null;

  // Check if all complete words match
  let matched = true;
  for (let i = 0; i < userWords.length - 1; i++) {
    if (i >= fullWords.length || userWords[i] !== fullWords[i]) {
      matched = false;
      break;
    }
  }

  if (matched && userWords.length > 0) {
    const lastUserWord = userWords[userWords.length - 1];
    const correspondingFullWord = fullWords[userWords.length - 1];

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

// ─── DOM Builder ────────────────────────────────────────────────────────

/**
 * buildSuggestionDOM — Creates the DOM content for the ViewZone.
 */
function buildSuggestionDOM(display: SuggestionDisplay | null, isPrefetching: boolean): string {
  const parts: string[] = [];

  if (isPrefetching) {
    parts.push(
      `<div class="rdat-prefetch-indicator">` +
      `<div class="rdat-prefetch-spinner"></div>` +
      `<span>Predicting translations…</span>` +
      `</div>`
    );
  }

  if (!display) {
    if (!isPrefetching) {
      parts.push(
        `<div class="rdat-suggestion-row">` +
        `<span class="rdat-suggestion-text--empty">Start typing to see translation predictions…</span>` +
        `</div>`
      );
    }
    return parts.join("");
  }

  const textClass = display.isPrefixMatch
    ? "rdat-suggestion-text--prefix-match"
    : "rdat-suggestion-text";

  const v1Text = (display.version1Remainder ?? "") || (display.version1Full ?? "");
  const v2Text = (display.version2Remainder ?? "") || (display.version2Full ?? "");

  parts.push(
    `<div class="rdat-suggestion-row">` +
    `<span class="rdat-suggestion-label rdat-suggestion-label--formal">[Tab] Formal:</span>` +
    `<span class="${textClass}">${escapeHtml(v1Text)}</span>` +
    `</div>`
  );

  parts.push(
    `<div class="rdat-suggestion-row">` +
    `<span class="rdat-suggestion-label rdat-suggestion-label--natural">[Ctrl+Tab] Natural:</span>` +
    `<span class="${textClass}">${escapeHtml(v2Text)}</span>` +
    `</div>`
  );

  return parts.join("");
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

  // ── New Predictive Translation Props ──
  /** Cached translation versions from the predictive prefetch engine */
  translationCache?: TranslationCache;
  /** Whether the prefetch engine is currently generating */
  isPrefetching?: boolean;
  /** Get cached versions for a given source sentence */
  getCachedVersions?: (sourceSentence: string) => TranslationVersions | null;
  /** Active source sentence for the current target line */
  activeSourceSentence?: string;
  /** Interrupt the prefetch engine to free GPU */
  interruptPrefetch?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────

/**
 * MonacoEditor — A thin wrapper around @monaco-editor/react configured
 * for the RDAT Copilot translation IDE.
 *
 * v4.0 — Predictive Zone Architecture:
 * - Replaces standard inlineCompletions with a custom IViewZone "Below-The-Line" widget
 * - Displays two translation versions (Formal/Literal and Natural/Standard)
 * - Dynamic prefix matching: shows only the remainder of what the user hasn't typed
 * - Custom keybindings: Tab (Version 1), Ctrl+Tab (Version 2)
 * - Proper disposal of IViewZone IDs and commands in cleanup
 * - RTL-aware: dir="auto" on the zone DOM node for native bidi support
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
  isPrefetching = false,
  getCachedVersions,
  activeSourceSentence,
  interruptPrefetch,
}: MonacoEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const cursorDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const highlightDecorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | string[]>([]);

  // ── ViewZone state ───────────────────────────────────────────────────
  const viewZoneIdRef = useRef<string | null>(null);
  const tabCommandIdRef = useRef<string | null>(null);
  const ctrlTabCommandIdRef = useRef<string | null>(null);
  const changeDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const lastSuggestionRef = useRef<SuggestionDisplay | null>(null);

  // Track the last source sentence we displayed for, to detect changes
  const lastSourceSentenceRef = useRef<string>("");

  // Inject styles on first render
  useEffect(() => {
    injectViewZoneStyles();
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

  const interruptPrefetchRef = useRef(interruptPrefetch);
  useEffect(() => { interruptPrefetchRef.current = interruptPrefetch; }, [interruptPrefetch]);

  const translationCacheRef = useRef(translationCache);
  useEffect(() => { translationCacheRef.current = translationCache; }, [translationCache]);

  const isPrefetchingRef = useRef(isPrefetching);
  useEffect(() => { isPrefetchingRef.current = isPrefetching; }, [isPrefetching]);

  const languageDirectionRef = useRef(languageDirection);
  useEffect(() => { languageDirectionRef.current = languageDirection; }, [languageDirection]);

  // ─── ViewZone Management ─────────────────────────────────────────────

  /**
   * updateViewZone — Creates, updates, or removes the predictive suggestion zone
   * below the active line in the editor.
   */
  const updateViewZone = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor) => {
      try {
      const position = editor.getPosition();
      if (!position) return;

      const model = editor.getModel();
      if (!model) return;

      // Source pane or disabled: remove zone
      if (!enableCompletions) {
        if (viewZoneIdRef.current !== null) {
          editor.changeViewZones((changeAccessor) => {
            changeAccessor.removeZone(viewZoneIdRef.current!);
          });
          viewZoneIdRef.current = null;
        }
        return;
      }

      // Get the current line text for prefix matching
      const currentLineContent = model.getLineContent(position.lineNumber) || "";
      const lineTextBeforeCursor = currentLineContent.substring(0, position.column - 1);

      // Get cached versions for the active source sentence
      const sourceSentence = activeSourceSentenceRef.current || "";
      const versions = getCachedVersionsRef.current?.(sourceSentence) ?? null;
      const prefetching = isPrefetchingRef.current;

      // Compute the suggestion display
      const display = versions
        ? computeSuggestionDisplay(lineTextBeforeCursor, versions)
        : null;

      // Store for keybinding access
      lastSuggestionRef.current = display;

      // Build the DOM content
      const htmlContent = buildSuggestionDOM(display, prefetching && !versions);

      // Direction attribute for RTL support
      const dir = languageDirectionRef.current === "ar-en" ? "ltr" : "rtl";

      // Change or create the view zone
      const currentZoneId = viewZoneIdRef.current;

      editor.changeViewZones((changeAccessor) => {
        // Remove existing zone if present
        if (currentZoneId !== null) {
          changeAccessor.removeZone(currentZoneId);
          viewZoneIdRef.current = null;
        }

        // Only create a zone if we have something to show
        if (htmlContent.trim().length > 0 || prefetching) {
          const domNode = document.createElement("div");
          domNode.className = "rdat-predictive-zone";
          domNode.setAttribute("dir", dir);
          domNode.innerHTML = htmlContent;

          const newZoneId = changeAccessor.addZone({
            afterLineNumber: position.lineNumber,
            heightInPx: htmlContent.trim().length > 0 ? 48 : 28,
            domNode: domNode,
            onDomNodeTop: (top) => {
              domNode.style.top = `${top}px`;
            },
            onComputedHeight: (_height) => {
              // Height is managed by heightInPx
            },
          });

          viewZoneIdRef.current = newZoneId;
        }
      });

      // Notify suggestion mode based on cache availability
      if (versions) {
        onSuggestionModeChangeRef.current?.("gtr");
      } else if (sourceSentence) {
        onSuggestionModeChangeRef.current?.("zero-shot");
      }
      } catch (zoneErr) {
        console.warn("[RDAT] updateViewZone error:", zoneErr);
      }
    },
    [enableCompletions]
  );

  // ─── Suggestion Insertion ────────────────────────────────────────────

  /**
   * insertSuggestion — Inserts the remainder of a cached version at the cursor.
   * Smart replacement: replaces the partial last word if prefix matching.
   */
  const insertSuggestion = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, versionIndex: 0 | 1) => {
      const suggestion = lastSuggestionRef.current;
      if (!suggestion) return;

      const remainder = versionIndex === 0
        ? (suggestion.version1Remainder ?? "")
        : (suggestion.version2Remainder ?? "");

      if (!remainder || (remainder?.length ?? 0) === 0) return;

      const position = editor.getPosition();
      const model = editor.getModel();
      if (!position || !model) return;

      // If it's a prefix match, we just insert the remainder at cursor
      // (the partial word is already in the document)
      editor.executeEdits("rdat-predictive-insert", [
        {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: remainder,
          forceMoveMarkers: true,
        },
      ]);

      // Trigger onChange with new value
      const newValue = editor.getValue();
      onChange(newValue ?? "");

      console.log(
        `[RDAT] Inserted ${versionIndex === 0 ? "Formal" : "Natural"} suggestion: ` +
        `"${(remainder ?? "").substring(0, 40)}${(remainder ?? "").length > 40 ? "…" : ""}"`
      );
    },
    [onChange]
  );

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
        // ── DISABLE inline suggestions (we use ViewZone instead) ──
        editor.updateOptions({
          inlineSuggest: {
            enabled: false,
          },
        });

        // ── Register custom keybindings ──
        // Tab → Insert Version 1 (Formal/Literal)
        const tabCommandId = `rdat.insertFormalSuggestion`;
        tabCommandIdRef.current = tabCommandId;

        editor.addCommand(
          monaco.KeyMod.Tab,
          () => {
            insertSuggestion(editor, 0);
          },
          `!findWidgetVisible && !suggestWidgetVisible && !inSnippetMode`
        );

        // Ctrl+Tab → Insert Version 2 (Natural/Standard)
        // Note: Monaco doesn't have a direct Ctrl+Tab key modifier constant
        // that works reliably. We use KeyMod.CtrlCmd | KeyMod.Tab.
        const ctrlTabCommandId = `rdat.insertNaturalSuggestion`;
        ctrlTabCommandIdRef.current = ctrlTabCommandId;

        editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab,
          () => {
            insertSuggestion(editor, 1);
          },
          `!findWidgetVisible && !suggestWidgetVisible && !inSnippetMode`
        );

        // ── Listen for content changes to update ViewZone ──
        changeDisposableRef.current = editor.onDidChangeModelContent(() => {
          // Interrupt prefetch to free GPU while typing
          interruptPrefetchRef.current?.();
          // Update the zone with new prefix match
          updateViewZone(editor);
        });

        // Also update zone on cursor position changes (line changes)
        editor.onDidChangeCursorPosition(() => {
          updateViewZone(editor);
        });

        // Initial zone render
        setTimeout(() => {
          try {
            if (editor.getModel() !== null) {
              updateViewZone(editor);
            }
          } catch {
            // Editor may have been disposed
          }
        }, 500);

        console.log(
          "[RDAT] Target editor mounted — Predictive Zone UI active (v4.0)"
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
      insertSuggestion,
      updateViewZone,
    ]
  );

  // ─── Update ViewZone when activeSourceSentence or cache changes ──────

  useEffect(() => {
    if (!editorRef.current || !enableCompletions) return;

    // Debounce the update slightly to avoid rapid re-renders
    const timer = setTimeout(() => {
      const ed = editorRef.current;
      if (ed) {
        try {
          if (ed.getModel() !== null) {
            updateViewZone(ed);
          }
        } catch {
          // Editor may have been disposed
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [activeSourceSentence, translationCache, isPrefetching, updateViewZone, enableCompletions]);

  // ─── Highlight Decoration ────────────────────────────────────────────

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    if (highlightLine === undefined || highlightLine <= 0) {
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

  // ─── Cleanup ─────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      console.log(
        `[RDAT] Monaco editor unmounting (language: ${resolvedLanguageId}) — disposing resources`
      );

      // Remove ViewZone
      const editor = editorRef.current;
      if (editor && viewZoneIdRef.current !== null) {
        try {
          if (editor.getModel() === null) {
            viewZoneIdRef.current = null;
          } else {
            editor.changeViewZones((changeAccessor) => {
              changeAccessor.removeZone(viewZoneIdRef.current!);
            });
            viewZoneIdRef.current = null;
          }
        } catch {
          // Editor may already be disposed
        }
        viewZoneIdRef.current = null;
      }

      // Dispose change listener
      if (changeDisposableRef.current) {
        changeDisposableRef.current.dispose();
        changeDisposableRef.current = null;
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

      lastSuggestionRef.current = null;
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
        inlineSuggest: {
          // DISABLED for target pane — we use ViewZone instead
          enabled: false,
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
