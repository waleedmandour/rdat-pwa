"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type * as Monaco from "monaco-editor";
import type { AMTALintIssue, LintMarker } from "@/types";
import type { CorpusEntry } from "@/lib/rag-types";
import { AMTA_LINT_DEBOUNCE_MS, AMTA_MARKER_OWNER, CORPUS_BOOTSTRAP_URL } from "@/lib/constants";
import { lintText, buildAMTACodeAction } from "@/lib/amta-linter";
import { getAssetUrl } from "@/lib/asset-url";

const getIsClient = () => true;
const subscribeNoop = () => () => {};

export function useAMTALinter() {
  const [issues, setIssues] = useState<AMTALintIssue[]>([]);
  const [lintCount, setLintCount] = useState(0);
  const [glossary, setGlossary] = useState<CorpusEntry[]>([]);

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const codeActionProviderRef = useRef<Monaco.IDisposable | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isClient = useSyncExternalStore(subscribeNoop, getIsClient, () => false);

  // Keep issues in a ref for the code action provider
  const issuesRef = useRef<AMTALintIssue[]>([]);
  useEffect(() => {
    issuesRef.current = issues;
  }, [issues]);

  // Load glossary on mount
  useEffect(() => {
    if (!isClient) return;

    fetch(getAssetUrl(CORPUS_BOOTSTRAP_URL))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: CorpusEntry[]) => {
        setGlossary(data);
        console.log(`[RDAT-AMTA] Loaded ${data.length} glossary entries for linting`);
      })
      .catch((err) => {
        console.warn("[RDAT-AMTA] Failed to load glossary:", err);
      });
  }, [isClient]);

  /**
   * attachEditor — Called when the Monaco editor mounts.
   * Registers the CodeActionProvider for AMTA quick fixes.
   */
  const attachEditor = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Register CodeActionProvider for AMTA quick fixes
      // Defensive: Monaco may not have registerCodeActionsProvider if CDN loading
      // was partially blocked (e.g., by strict COEP headers).
      try {
        if (codeActionProviderRef.current) {
          codeActionProviderRef.current.dispose();
          codeActionProviderRef.current = null;
        }

        // Guard: ensure monaco.languages and the method exist
        if (
          monaco?.languages &&
          typeof monaco.languages.registerCodeActionProvider === "function"
        ) {
          codeActionProviderRef.current = monaco.languages.registerCodeActionProvider(
            "rdat-target",
            {
              provideCodeActions: (model, _range, _context, _token) => {
                const currentIssues = issuesRef.current;
                if (currentIssues.length === 0) return { actions: [], dispose: () => {} };

                const actions: Monaco.languages.CodeAction[] = currentIssues.map((issue) => {
                  const { title, edit } = buildAMTACodeAction(issue);
                  return {
                    title,
                    kind: "quickfix" as string,
                    edit: {
                      edits: [
                        {
                          resource: model.uri,
                          edit: {
                            range: {
                              startLineNumber: edit.range.startLineNumber,
                              startColumn: edit.range.startColumn,
                              endLineNumber: edit.range.endLineNumber,
                              endColumn: edit.range.endColumn,
                            },
                            text: edit.text,
                          },
                        } as any,
                      ],
                    },
                    diagnostics: [],
                    isPreferred: true,
                  } as any;
                });

                return { actions, dispose: () => {} };
              },
            }
          );

          console.log("[RDAT-AMTA] CodeActionProvider registered");
        } else {
          console.warn(
            "[RDAT-AMTA] registerCodeActionsProvider not available — Ctrl+. quick fixes disabled. " +
            "Markers (squiggles) will still work."
          );
        }
      } catch (err) {
        console.warn("[RDAT-AMTA] Failed to register CodeActionProvider:", err);
        // Non-fatal: yellow squiggly markers still work via setModelMarkers
      }
    },
    []
  );

  /**
   * runLint — Runs the AMTA linter on the given text and applies Monaco markers.
   */
  const runLint = useCallback(
    (text: string) => {
      if (!editorRef.current || !monacoRef.current || glossary.length === 0) return;

      const newIssues = lintText(text, glossary);
      setIssues(newIssues);
      setLintCount(newIssues.length);

      // Apply Monaco markers (yellow squiggly warnings)
      try {
        const model = editorRef.current?.getModel();
        if (!model || !monacoRef.current?.editor?.setModelMarkers) return;

        const markers: Monaco.editor.IMarkerData[] = newIssues.map((issue) => ({
          startLineNumber: issue.startLineNumber,
          startColumn: issue.startColumn,
          endLineNumber: issue.endLineNumber,
          endColumn: issue.endColumn,
          message: issue.message,
          severity: 4 as Monaco.MarkerSeverity, // MarkerSeverity.Warning
          source: "AMTA Linter",
        }));

        monacoRef.current.editor.setModelMarkers(
          model,
          AMTA_MARKER_OWNER,
          markers
        );

        if (newIssues.length > 0) {
          console.log(`[RDAT-AMTA] Applied ${newIssues.length} markers to editor`);
        }
      } catch (err) {
        console.warn("[RDAT-AMTA] Failed to apply markers:", err);
      }
    },
    [glossary]
  );

  /**
   * debouncedLint — Called on every editor change. Debounces the actual lint run.
   */
  const debouncedLint = useCallback(
    (text: string) => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        runLint(text);
        debounceRef.current = null;
      }, AMTA_LINT_DEBOUNCE_MS);
    },
    [runLint]
  );

  /**
   * clearMarkers — Remove all AMTA markers from the editor.
   */
  const clearMarkers = useCallback(() => {
    try {
      if (!editorRef.current || !monacoRef.current) return;

      const model = editorRef.current.getModel();
      if (!model || !monacoRef.current.editor?.setModelMarkers) return;

      monacoRef.current.editor.setModelMarkers(model, AMTA_MARKER_OWNER, []);
    } catch (err) {
      console.warn("[RDAT-AMTA] Failed to clear markers:", err);
    }
    setIssues([]);
    setLintCount(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      if (codeActionProviderRef.current) {
        codeActionProviderRef.current.dispose();
      }
    };
  }, []);

  return {
    issues,
    lintCount,
    attachEditor,
    debouncedLint,
    runLint,
    clearMarkers,
    isGlossaryLoaded: glossary.length > 0,
    glossarySize: glossary.length,
  };
}
