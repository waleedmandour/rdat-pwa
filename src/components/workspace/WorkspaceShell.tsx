"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { GPUStatus, AppMode, RewriteResult, LanguageDirection } from "@/types";
import type { RAGResult } from "@/lib/rag-types";
import type * as Monaco from "monaco-editor";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { WebGPUBanner } from "@/components/gpu/WebGPUBanner";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { EditorWelcome } from "./EditorWelcome";
import { MonacoEditor } from "./MonacoEditor";
import { useEditorEventLoop } from "@/hooks/useEditorEventLoop";
import { useRAG } from "@/hooks/useRAG";
import { useWebLLM } from "@/hooks/useWebLLM";
import { useGemini } from "@/hooks/useGemini";
import { useAMTALinter } from "@/hooks/useAMTALinter";
import { buildMessages } from "@/lib/prompt-builder";
import { LANGUAGE_PAIRS, LANG_DIRECTION_STORAGE } from "@/lib/constants";
import { extractCurrentSentence, truncateForEmbedding } from "@/lib/sentence-extractor";
import { FileText, BookOpen, Sparkles, Loader2, X } from "lucide-react";

/**
 * Available editor views — the user can switch between them.
 */
type EditorView = "welcome" | "editor";

export function WorkspaceShell({
  gpuStatus,
  appMode,
}: {
  gpuStatus: GPUStatus;
  appMode: AppMode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeView, setActiveView] = useState<EditorView>("editor");

  // ─── Language Direction State ───────────────────────────────────
  const [langDirection, setLangDirection] = useState<LanguageDirection>(() => {
    if (typeof window === "undefined") return "en-ar";
    try {
      const stored = localStorage.getItem(LANG_DIRECTION_STORAGE);
      return (stored === "ar-en" ? "ar-en" : "en-ar") as LanguageDirection;
    } catch {
      return "en-ar";
    }
  });

  const swapLanguageDirection = useCallback(() => {
    setLangDirection((prev) => {
      const next: LanguageDirection = prev === "en-ar" ? "ar-en" : "en-ar";
      try { localStorage.setItem(LANG_DIRECTION_STORAGE, next); } catch { /* noop */ }
      console.log(`[RDAT] Language direction swapped: ${prev} → ${next}`);
      return next;
    });
  }, []);

  const langPair = LANGUAGE_PAIRS[langDirection];

  const [sourceText, setSourceText] = useState(
    "Force Majeure. Neither party shall be held liable for failure to perform obligations under this agreement due to events beyond reasonable control.\n\nIntellectual Property Rights. All patents, trademarks, copyrights, and trade secrets developed during the term of this agreement shall remain the exclusive property of the originating party."
  );

  // ─── Gemini Cloud (Reasoning Track) ────────────────────────────
  const gemini = useGemini();

  // ─── AMTA Linter ────────────────────────────────────────────────
  const amta = useAMTALinter();

  // ─── Rewrite Panel State ────────────────────────────────────────
  const [showRewritePanel, setShowRewritePanel] = useState(false);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  // ─── Editor instance ref for imperative operations ──────────────
  const editorInstanceRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const selectionDisposableRef = useRef<Monaco.IDisposable | null>(null);

  // Track editor selection state for Rewrite button disable logic
  const [hasSelection, setHasSelection] = useState(false);

  // ─── RAG Pipeline ──────────────────────────────────────────────
  const rag = useRAG();

  // ─── WebLLM Engine ─────────────────────────────────────────────
  const webllm = useWebLLM();

  // ─── Editor Event Loop (with RAG + AMTA callback) ─────────────
  const ragSearchRef = useRef(rag.search);
  useEffect(() => {
    ragSearchRef.current = rag.search;
  });

  const amtaDebouncedLintRef = useRef(amta.debouncedLint);
  useEffect(() => {
    amtaDebouncedLintRef.current = amta.debouncedLint;
  });

  const { inferenceState, handleEditorChange, cleanup } =
    useEditorEventLoop({
      onDebounced: (text: string) => {
        // Extract the current sentence for RAG query
        const sentence = extractCurrentSentence(text);
        if (!sentence || sentence.trim().length < 3) return;

        const query = truncateForEmbedding(sentence);
        console.log(
          `[RDAT] RAG query triggered — sentence: "${sentence.substring(0, 80)}${sentence.length > 80 ? "…" : ""}"`
        );

        // Fire RAG search in the Web Worker (off main thread)
        ragSearchRef.current(query);

        // Fire AMTA lint (debounced internally)
        amtaDebouncedLintRef.current(text);
      },
    });

  // Cleanup event loop on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  /**
   * generateCompletion — Orchestrates RAG + WebLLM for ghost text.
   * Called from MonacoEditor's inline completions provider.
   */
  const generateCompletion = useCallback(
    async (editorText: string, ragResults: RAGResult[]): Promise<string | null> => {
      // Step 1: RAG search (if not already cached from debounce)
      let results = ragResults;
      if (results.length === 0 && rag.isReady) {
        const sentence = extractCurrentSentence(editorText);
        if (sentence && sentence.trim().length >= 3) {
          results = await rag.search(truncateForEmbedding(sentence));
        }
      }

      // Step 2: Build messages with RAG context + language direction
      const messages = buildMessages(editorText, results, langDirection);

      // Step 3: Generate via WebLLM
      return webllm.generate(messages);
    },
    [rag, webllm, langDirection]
  );

  /**
   * handleEditorDidMount — Called when Monaco mounts.
   * Stores editor ref, attaches AMTA linter, and tracks selection changes.
   */
  const handleEditorDidMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      editorInstanceRef.current = editor;
      amta.attachEditor(editor, monaco);

      // Track selection changes for the Rewrite button
      const updateSelection = () => {
        const sel = editor.getSelection();
        setHasSelection(!!sel && !sel.isEmpty());
      };
      selectionDisposableRef.current = editor.onDidChangeCursorSelection(updateSelection);
      updateSelection();

      // Run initial lint on editor content
      const text = editor.getValue();
      if (text) {
        amta.runLint(text);
      }
    },
    [amta]
  );

  // Cleanup selection disposable on unmount
  useEffect(() => {
    return () => {
      if (selectionDisposableRef.current) {
        selectionDisposableRef.current.dispose();
        selectionDisposableRef.current = null;
      }
    };
  }, []);

  /**
   * handleRewrite — Sends selected text to Gemini for rewriting.
   */
  const handleRewrite = useCallback(async () => {
    const editor = editorInstanceRef.current;
    if (!editor) return;

    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    if (!selectedText || selectedText.trim().length === 0) return;

    setRewriteError(null);
    setShowRewritePanel(true);
    setRewriteResult(null);

    console.log(`[RDAT] Rewrite requested for ${selectedText.length} chars`);

    const result = await gemini.rewrite(selectedText, rag.lastResults, langDirection);

    if (result) {
      setRewriteResult({
        original: selectedText,
        rewritten: result,
        timestamp: Date.now(),
      });
    } else {
      setRewriteError("Gemini could not generate a rewrite. Check your API key and try again.");
    }
  }, [gemini, rag.lastResults, langDirection]);

  /**
   * handleAcceptRewrite — Replaces the selected text with the rewritten version.
   */
  const handleAcceptRewrite = useCallback(() => {
    if (!rewriteResult || !editorInstanceRef.current) return;

    const selection = editorInstanceRef.current.getSelection();
    if (!selection) return;

    editorInstanceRef.current.executeEdits("gemini-rewrite", [
      {
        range: selection,
        text: rewriteResult.rewritten,
      },
    ]);

    setShowRewritePanel(false);
    setRewriteResult(null);
    console.log("[RDAT] Rewrite accepted — selection replaced");
  }, [rewriteResult]);

  const openView = (view: EditorView) => {
    setActiveView(view);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--ide-bg-primary)]">
      {/* Title Bar / Header */}
      <Header
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        langDirection={langDirection}
        langPair={langPair}
        onSwapDirection={swapLanguageDirection}
      />

      {/* WebGPU Warning Banner (only when unsupported) */}
      <WebGPUBanner gpuStatus={gpuStatus} />

      {/* Main body: Sidebar + Editor */}
      <div className="flex flex-1 min-h-0">
        {/* Activity Bar + Sidebar */}
        {sidebarOpen && (
          <Sidebar
            activeView={activeView}
            onViewChange={openView}
          />
        )}

        {/* Editor area */}
        <main className="flex-1 flex flex-col min-w-0 bg-[var(--ide-editor-bg)]">
          {/* Editor tabs bar */}
          <div className="flex items-center h-9 px-1 border-b border-[var(--ide-border)] bg-[var(--ide-tabs-bg)] overflow-x-auto">
            {/* Welcome tab */}
            <button
              onClick={() => openView("welcome")}
              className={`flex items-center gap-1.5 px-3 h-full text-[12px] border-r border-[var(--ide-border)] cursor-pointer transition-colors whitespace-nowrap ${
                activeView === "welcome"
                  ? "text-[var(--ide-text)] bg-[var(--ide-editor-bg)] border-b-2 border-b-teal-400"
                  : "text-[var(--ide-text-dim)] hover:text-[var(--ide-text-muted)] hover:bg-[var(--ide-hover)]"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Welcome</span>
            </button>

            {/* Editor tab */}
            <button
              onClick={() => openView("editor")}
              className={`flex items-center gap-1.5 px-3 h-full text-[12px] border-r border-[var(--ide-border)] cursor-pointer transition-colors whitespace-nowrap ${
                activeView === "editor"
                  ? "text-[var(--ide-text)] bg-[var(--ide-editor-bg)] border-b-2 border-b-teal-400"
                  : "text-[var(--ide-text-dim)] hover:text-[var(--ide-text-muted)] hover:bg-[var(--ide-hover)]"
              }`}
            >
              <FileText className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Translation Editor</span>
              {/* Dirty indicator */}
              <span className="w-2 h-2 rounded-full bg-teal-400 ml-1 flex-shrink-0" />
            </button>

            {/* Gemini Rewrite button */}
            <button
              onClick={handleRewrite}
              disabled={!hasSelection || !gemini.hasApiKey || gemini.isRewriting}
              className="flex items-center gap-1.5 px-2.5 h-full text-[12px] border-r border-[var(--ide-border)] cursor-pointer transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
              title={!gemini.hasApiKey ? "Set Gemini API key in Settings first" : hasSelection ? "Rewrite selected text with Gemini" : "Select text to rewrite"}
            >
              {gemini.isRewriting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span className="truncate">{gemini.isRewriting ? "Rewriting…" : "Rewrite"}</span>
            </button>
          </div>

          {/* Editor content area */}
          <div className="flex-1 min-h-0 relative">
            {activeView === "editor" ? (
              <MonacoEditor
                value={sourceText}
                onChange={handleEditorChange}
                generateCompletion={generateCompletion}
                interruptGeneration={webllm.interruptGenerate}
                ragResults={rag.lastResults}
                isLLMReady={webllm.isReady}
                onEditorDidMount={handleEditorDidMount}
              />
            ) : (
              <div className="h-full overflow-auto">
                <EditorWelcome appMode={appMode} />
              </div>
            )}

            {/* Gemini Rewrite Side Panel */}
            {showRewritePanel && (
              <div className="absolute bottom-0 right-0 w-[420px] max-h-[50%] border-t border-l border-[var(--ide-border)] bg-[var(--ide-panel)] flex flex-col shadow-2xl z-10">
                <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--ide-border)]">
                  <span className="text-xs font-medium text-[var(--ide-text)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                    Gemini Rewrite
                  </span>
                  <button
                    onClick={() => setShowRewritePanel(false)}
                    className="flex items-center justify-center w-5 h-5 rounded text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)] transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-4">
                  {gemini.isRewriting && (
                    <div className="flex items-center justify-center py-8">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
                        <span className="text-xs text-[var(--ide-text-muted)]">
                          Gemini is rewriting…
                        </span>
                      </div>
                    </div>
                  )}
                  {rewriteError && (
                    <div className="p-3 rounded border border-red-500/30 bg-red-500/5">
                      <p className="text-xs text-red-400">{rewriteError}</p>
                    </div>
                  )}
                  {rewriteResult && (
                    <>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--ide-text-dim)] mb-1">Original</p>
                        <p className="text-xs text-[var(--ide-text-muted)] bg-[var(--ide-bg-tertiary)] p-2 rounded max-h-32 overflow-y-auto">
                          {rewriteResult.original}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--ide-text-dim)] mb-1">Rewritten</p>
                        <p className="text-xs text-[var(--ide-text)] bg-[var(--ide-bg-tertiary)] p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap">
                          {rewriteResult.rewritten}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                {rewriteResult && (
                  <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--ide-border)]">
                    <button
                      onClick={handleAcceptRewrite}
                      className="px-3 py-1 text-[11px] rounded bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => setShowRewritePanel(false)}
                      className="px-3 py-1 text-[11px] rounded text-[var(--ide-text-muted)] hover:bg-[var(--ide-hover)] transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Status Bar */}
      <StatusBar
        gpuStatus={gpuStatus}
        appMode={appMode}
        inferenceState={inferenceState}
        ragState={rag.ragState}
        ragTiming={rag.lastTiming}
        embeddingMode={rag.embeddingMode}
        ragStatusMessage={rag.statusMessage}
        ragResultCount={rag.lastResults.length}
        webllmState={webllm.engineState}
        webllmProgress={webllm.progress}
        geminiState={gemini.geminiState}
        amtaLintCount={amta.lintCount}
        langPair={langPair}
        onSwapDirection={swapLanguageDirection}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        geminiMaskedKey={gemini.getMaskedKey()}
        geminiHasApiKey={gemini.hasApiKey}
        onSetGeminiApiKey={gemini.setApiKey}
        langDirection={langDirection}
        onSwapDirection={swapLanguageDirection}
      />
    </div>
  );
}
