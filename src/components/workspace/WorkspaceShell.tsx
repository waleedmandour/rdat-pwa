"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { GPUStatus, AppMode, RewriteResult, LanguageDirection, SuggestionMode } from "@/types";
import type { RAGResult } from "@/lib/rag-types";
import type * as Monaco from "monaco-editor";
import { Header } from "./Header";
import { AboutDialog } from "./AboutDialog";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { WebGPUBanner } from "@/components/gpu/WebGPUBanner";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { EditorWelcome } from "./EditorWelcome";
import { MonacoEditor } from "./MonacoEditor";
import { TerminologyPanel } from "./TerminologyPanel";
import { useEditorEventLoop } from "@/hooks/useEditorEventLoop";
import { useGTRBootstrapper } from "@/hooks/useGTRBootstrapper";
import { useWebLLM } from "@/hooks/useWebLLM";
import { useGemini } from "@/hooks/useGemini";
import { useAMTALinter } from "@/hooks/useAMTALinter";
import { buildMessages } from "@/lib/prompt-builder";
import {
  LANGUAGE_PAIRS,
  LANG_DIRECTION_STORAGE,
  DEFAULT_SOURCE_TEXT_EN,
  DEFAULT_SOURCE_TEXT_AR,
  DEFAULT_TARGET_TEXT_AR,
  WORKSPACE_AUTOSAVE_KEY,
  WORKSPACE_AUTOSAVE_DEBOUNCE_MS,
} from "@/lib/constants";
import { truncateForEmbedding, getSourceSentence } from "@/lib/sentence-extractor";
import { FileText, BookOpen, Sparkles, Loader2, X, Pencil, Check, Lock } from "lucide-react";

/**
 * Available editor views — the user can switch between them.
 */
export type EditorView = "welcome" | "editor";

/**
 * Autosaved workspace state type.
 */
interface AutosaveState {
  sourceText: string;
  targetText: string;
  langDirection: string;
  timestamp: number;
}

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

  const langPair = LANGUAGE_PAIRS[langDirection];

  // ─── Split-Pane State ───────────────────────────────────────────
  // Restore workspace from localStorage autosave, or use defaults
  const [sourceText, setSourceText] = useState(() => {
    try {
      const saved = localStorage.getItem(WORKSPACE_AUTOSAVE_KEY);
      if (saved) {
        const parsed: AutosaveState = JSON.parse(saved);
        if (parsed.sourceText && parsed.timestamp) {
          console.log(`[RDAT] Restored autosaved workspace (source: ${parsed.sourceText.length} chars, ${new Date(parsed.timestamp).toLocaleTimeString()})`);
          return parsed.sourceText;
        }
      }
    } catch { /* noop */ }
    return langDirection === "en-ar" ? DEFAULT_SOURCE_TEXT_EN : DEFAULT_SOURCE_TEXT_AR;
  });

  // Target text — the user's translation draft (restore from autosave or defaults)
  const [targetText, setTargetText] = useState(() => {
    try {
      const saved = localStorage.getItem(WORKSPACE_AUTOSAVE_KEY);
      if (saved) {
        const parsed: AutosaveState = JSON.parse(saved);
        if (parsed.targetText !== undefined && parsed.timestamp) {
          return parsed.targetText;
        }
      }
    } catch { /* noop */ }
    return langDirection === "en-ar" ? DEFAULT_TARGET_TEXT_AR : "";
  });

  // Track the active line in the target editor (for source line extraction)
  const [activeTargetLine, setActiveTargetLine] = useState(1);

  // ─── Language Direction Swap ────────────────────────────────────
  const swapLanguageDirection = useCallback(() => {
    setLangDirection((prev) => {
      const next: LanguageDirection = prev === "en-ar" ? "ar-en" : "en-ar";
      try { localStorage.setItem(LANG_DIRECTION_STORAGE, next); } catch { /* noop */ }
      console.log(`[RDAT] Language direction swapped: ${prev} → ${next}`);
      return next;
    });
    // Reset source/target text for new language direction
    const nextDir: LanguageDirection = langDirection === "en-ar" ? "ar-en" : "en-ar";
    setSourceText(nextDir === "en-ar" ? DEFAULT_SOURCE_TEXT_EN : DEFAULT_SOURCE_TEXT_AR);
    setTargetText(nextDir === "en-ar" ? DEFAULT_TARGET_TEXT_AR : "");
    setActiveTargetLine(1);
  }, [langDirection]);

  // Source editing overlay state
  const [isEditingSource, setIsEditingSource] = useState(false);
  const [editSourceDraft, setEditSourceDraft] = useState("");

  // Refs for async access in callbacks
  const sourceTextRef = useRef(sourceText);
  const activeTargetLineRef = useRef(activeTargetLine);

  useEffect(() => { sourceTextRef.current = sourceText; }, [sourceText]);
  useEffect(() => { activeTargetLineRef.current = activeTargetLine; }, [activeTargetLine]);

  // ─── Workspace Autosave (debounced 2s) ─────────────────────────
  const targetTextRef = useRef(targetText);
  const langDirectionRef = useRef(langDirection);
  useEffect(() => { targetTextRef.current = targetText; }, [targetText]);
  useEffect(() => { langDirectionRef.current = langDirection; }, [langDirection]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state: AutosaveState = {
          sourceText: sourceTextRef.current,
          targetText: targetTextRef.current,
          langDirection: langDirectionRef.current,
          timestamp: Date.now(),
        };
        localStorage.setItem(WORKSPACE_AUTOSAVE_KEY, JSON.stringify(state));
        console.log(`[RDAT] Workspace autosaved (${state.sourceText.length} + ${state.targetText.length} chars)`);
      } catch (err) {
        console.warn("[RDAT] Autosave failed:", err);
      }
    }, WORKSPACE_AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [sourceText, targetText, langDirection]);

  // Source text defaults are set in swapLanguageDirection callback
  // (avoids cascading render from setState-in-effect)

  // ─── Source Editing Handlers ────────────────────────────────────
  const handleOpenSourceEditor = useCallback(() => {
    setEditSourceDraft(sourceTextRef.current);
    setIsEditingSource(true);
  }, []);

  const handleApplySourceEdit = useCallback(() => {
    setSourceText(editSourceDraft);
    setIsEditingSource(false);
    console.log(`[RDAT] Source text updated (${editSourceDraft.length} chars, ${editSourceDraft.split("\n").length} lines)`);
  }, [editSourceDraft]);

  const handleCancelSourceEdit = useCallback(() => {
    setIsEditingSource(false);
    setEditSourceDraft("");
  }, []);

  // ─── Cursor Position Tracking (Target Editor) ───────────────────
  const handleCursorPositionChange = useCallback((position: { lineNumber: number; column: number }) => {
    setActiveTargetLine(position.lineNumber);
  }, []);

  // ─── Gemini Cloud (Reasoning Track) ────────────────────────────
  const gemini = useGemini();

  // ─── AMTA Linter ────────────────────────────────────────────────
  const amta = useAMTALinter();

  // ─── Rewrite Panel State ────────────────────────────────────────
  const [showRewritePanel, setShowRewritePanel] = useState(false);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  // Store the source sentence at rewrite time (avoid ref-during-render)
  const [rewriteSourceSentence, setRewriteSourceSentence] = useState("");

  // ─── Clear Workspace Handler ────────────────────────────────────
  const handleClearWorkspace = useCallback(() => {
    setSourceText(langDirection === "en-ar" ? DEFAULT_SOURCE_TEXT_EN : DEFAULT_SOURCE_TEXT_AR);
    setTargetText(langDirection === "en-ar" ? DEFAULT_TARGET_TEXT_AR : "");
    setActiveTargetLine(1);
    setShowRewritePanel(false);
    setRewriteResult(null);

    // Clear autosaved state
    try {
      localStorage.removeItem(WORKSPACE_AUTOSAVE_KEY);
      console.log("[RDAT] Workspace cleared — autosave removed");
    } catch { /* noop */ }
  }, [langDirection]);

  // ─── Suggestion Mode State (GTR vs Zero-Shot) ──────────────────
  const [suggestionMode, setSuggestionMode] = useState<SuggestionMode>("gtr");

  // ─── About Dialog ────────────────────────────────────────────────
  const [aboutOpen, setAboutOpen] = useState(false);

  // ─── Editor instance ref for imperative operations ──────────────
  const editorInstanceRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const selectionDisposableRef = useRef<Monaco.IDisposable | null>(null);

  // Track editor selection state for Rewrite button disable logic
  const [hasSelection, setHasSelection] = useState(false);

  // ─── GTR Pipeline (RAG + Corpus Caching) ──────────────────────
  const rag = useGTRBootstrapper();

  // ─── WebLLM Engine ─────────────────────────────────────────────
  const webllm = useWebLLM();

  // ─── Editor Event Loop (Source-Driven RAG + AMTA callback) ──────
  const ragSearchRef = useRef(rag.search);
  useEffect(() => { ragSearchRef.current = rag.search; });

  const amtaDebouncedLintRef = useRef(amta.debouncedLint);
  useEffect(() => { amtaDebouncedLintRef.current = amta.debouncedLint; });

  const { inferenceState, handleEditorChange, cleanup } =
    useEditorEventLoop({
      onDebounced: (text: string) => {
        // ── SOURCE-DRIVEN RAG: Extract the corresponding source line ──
        const currentLine = activeTargetLineRef.current;
        const sourceSentence = getSourceSentence(sourceTextRef.current, currentLine);

        if (sourceSentence && sourceSentence.trim().length >= 3) {
          const query = truncateForEmbedding(sourceSentence);
          console.log(
            `[RDAT] RAG query triggered (source-driven) — source line ${currentLine}: "${sourceSentence.substring(0, 80)}${sourceSentence.length > 80 ? "…" : ""}"`
          );

          // Fire RAG search on SOURCE text (not target draft)
          ragSearchRef.current(query);
        }

        // Fire AMTA lint on TARGET text (debounced internally)
        amtaDebouncedLintRef.current(text);
      },
    });

  // Cleanup event loop on unmount
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  /**
   * generateCompletion — Orchestrates SOURCE-DRIVEN RAG + AI for نص مخفي (ghost text).
   * Called from MonacoEditor's inline completions provider (target pane only).
   *
   * Pipeline v3.0 — Always-On Fallback:
   *   1. Extract the active source sentence (from source pane, line-matched)
   *   2. RAG search on source sentence (if not cached from debounce)
   *   3. Build messages dynamically:
   *      - If RAG > 0: Context-Augmented Prompt (GTR terminology enforced)
   *      - If RAG === 0: Zero-Shot Translation Prompt (pure LLM knowledge)
   *   4a. Generate via WebLLM (Gemma local) — PRIMARY
   *   4b. Fall back to Gemini (cloud) if WebLLM not ready — SECONDARY
   *   4c. Fall back to mock suggestions if neither available
   *
   * Key change: Generation is NEVER aborted when RAG = 0. The pipeline
   * always produces a suggestion, switching to zero-shot mode transparently.
   */
  const generateCompletion = useCallback(
    async (editorText: string, ragResults: RAGResult[]): Promise<string | null> => {
      // Step 1: Extract source sentence corresponding to target cursor position
      const currentLine = activeTargetLineRef.current;
      const sourceSentence = getSourceSentence(sourceTextRef.current, currentLine) || "";

      // Step 2: RAG search on SOURCE text (if not already cached from debounce)
      let results = ragResults;
      if (results.length === 0 && rag.isReady) {
        if (sourceSentence && sourceSentence.trim().length >= 3) {
          results = await rag.search(truncateForEmbedding(sourceSentence));
          console.log(`[RDAT] Ghost text RAG fallback — searched source line ${currentLine}`);
        }
      }

      // Step 3: Build messages dynamically based on RAG availability
      const { messages, usedGTR } = buildMessages(editorText, results, langDirection, sourceSentence);

      // Update suggestion mode for the StatusBar indicator
      setSuggestionMode(usedGTR ? "gtr" : "zero-shot");

      console.log(
        `[RDAT] Ghost text pipeline — mode: ${usedGTR ? "GTR (Context-Augmented)" : "Zero-Shot (Fallback)"}, ` +
        `RAG results: ${results.length}`
      );

      // Step 4a: Try WebLLM first (Sovereign Track — local GPU)
      // ALWAYS attempt generation — never abort when RAG = 0
      if (webllm.isReady) {
        return webllm.generate(messages);
      }

      // Step 4b: Fall back to Gemini (Reasoning Track — cloud)
      if (gemini.hasApiKey) {
        console.log("[RDAT] Ghost text: WebLLM not ready, falling back to Gemini cloud");
        return gemini.ghostText(sourceSentence, editorText, results, langDirection);
      }

      // Step 4c: Neither available — return null (MonacoEditor will use mock)
      console.log("[RDAT] Ghost text: No AI engine available");
      return null;
    },
    [rag, webllm, gemini, langDirection]
  );

  /**
   * handleEditorDidMount — Called when the TARGET editor mounts.
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

      console.log("[RDAT] Target editor mounted — AMTA linter and selection tracking attached");
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
   * handleRewrite — Sends selected TARGET text AND corresponding SOURCE text to Gemini.
   *
   * Updated for split-pane: The rewrite now includes the source sentence
   * so Gemini can evaluate translation accuracy before rewriting.
   */
  const handleRewrite = useCallback(async () => {
    const editor = editorInstanceRef.current;
    if (!editor) return;

    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    if (!selectedText || selectedText.trim().length === 0) return;

    // Extract corresponding source sentence for accuracy evaluation
    const currentLine = activeTargetLineRef.current;
    const sourceSentence = getSourceSentence(sourceTextRef.current, currentLine) || "";

    setRewriteError(null);
    setShowRewritePanel(true);
    setRewriteResult(null);
    setRewriteSourceSentence(sourceSentence);

    console.log(
      `[RDAT] Rewrite requested — ${selectedText.length} chars target, ${sourceSentence.length} chars source`
    );

    // Send BOTH source and target to Gemini for accuracy-aware rewriting
    const result = await gemini.rewrite(
      selectedText,
      rag.lastResults,
      langDirection,
      undefined,
      sourceSentence
    );

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

    // Update the target text state
    setTargetText(editorInstanceRef.current.getValue());

    setShowRewritePanel(false);
    setRewriteResult(null);
    console.log("[RDAT] Rewrite accepted — selection replaced in target pane");
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
        onOpenAbout={() => setAboutOpen(true)}
        onClearWorkspace={handleClearWorkspace}
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
            geminiMaskedKey={gemini.getMaskedKey()}
            geminiHasApiKey={gemini.hasApiKey}
            onSetGeminiApiKey={gemini.setApiKey}
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
              <span className="truncate">Translation Workspace</span>
              {/* Dirty indicator */}
              <span className="w-2 h-2 rounded-full bg-teal-400 ml-1 flex-shrink-0" />
            </button>

            {/* Gemini Rewrite button */}
            <button
              onClick={handleRewrite}
              disabled={!hasSelection || !gemini.hasApiKey || gemini.isRewriting}
              className="flex items-center gap-1.5 px-2.5 h-full text-[12px] border-r border-[var(--ide-border)] cursor-pointer transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
              title={!gemini.hasApiKey ? "Set Gemini API key in Settings first" : hasSelection ? "Rewrite selected text with Gemini (source-aware)" : "Select text to rewrite"}
            >
              {gemini.isRewriting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span className="truncate">{gemini.isRewriting ? "Rewriting…" : "Rewrite"}</span>
            </button>

            {/* Source line indicator */}
            <div className="flex items-center gap-1.5 px-3 h-full text-[11px] text-[var(--ide-text-dim)] ml-auto">
              <Lock className="w-3 h-3" />
              <span>Source L{activeTargetLine}</span>
            </div>
          </div>

          {/* Editor content area */}
          <div className="flex-1 min-h-0 relative">
            {activeView === "editor" ? (
              /* ── Split-Pane Workspace ── */
              <PanelGroup direction="horizontal" className="h-full">
                {/* ─── Source Pane (Left) ─── */}
                <Panel defaultSize={38} minSize={20} order={1}>
                  <div className="h-full flex flex-col">
                    {/* Source pane header */}
                    <div className="flex items-center justify-between h-8 px-3 border-b border-[var(--ide-border)] bg-[var(--ide-tabs-bg)] select-none">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400/70" />
                        <span className="text-[11px] font-medium text-[var(--ide-text-muted)]">
                          SOURCE
                        </span>
                        <span className="text-[10px] text-[var(--ide-text-dim)] px-1.5 py-0.5 rounded bg-[var(--ide-bg-secondary)] border border-[var(--ide-border)]">
                          {langPair.sourceLabel}
                        </span>
                        <span className="text-[10px] text-[var(--ide-text-dim)]" dir="rtl">
                          ({langPair.sourceLabelAr})
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleOpenSourceEditor}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--ide-text-dim)] hover:text-[var(--ide-text-muted)] hover:bg-[var(--ide-hover)] transition-colors cursor-pointer"
                          title="Edit source text"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      </div>
                    </div>

                    {/* Source editor */}
                    <div className="flex-1 min-h-0 flex flex-col relative">
                      <div className="flex-1 relative min-h-0">
                        <MonacoEditor
                          value={sourceText}
                          onChange={() => { /* readOnly: no onChange needed */ }}
                          readOnly
                          enableCompletions={false}
                          languageId="rdat-source"
                          highlightLine={activeTargetLine}
                        />

                        {/* Source editing overlay */}
                        {isEditingSource && (
                          <div className="absolute inset-0 bg-[var(--ide-bg-primary)]/95 backdrop-blur-sm z-20 flex flex-col p-3 gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] font-medium text-[var(--ide-text)]">
                                Edit Source Text
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={handleCancelSourceEdit}
                                  className="px-2.5 py-1 text-[10px] rounded text-[var(--ide-text-muted)] hover:bg-[var(--ide-hover)] transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleApplySourceEdit}
                                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors cursor-pointer"
                                >
                                  <Check className="w-3 h-3" />
                                  Apply
                                </button>
                              </div>
                            </div>
                            <textarea
                              value={editSourceDraft}
                              onChange={(e) => setEditSourceDraft(e.target.value)}
                              className="flex-1 w-full bg-[var(--ide-bg-secondary)] border border-[var(--ide-border)] rounded p-3 text-[13px] text-[var(--ide-text)] font-mono leading-relaxed resize-none focus:outline-none focus:border-teal-500/50"
                              placeholder="Paste your source text here..."
                              dir={langDirection === "ar-en" ? "rtl" : "ltr"}
                              autoFocus
                            />
                            <div className="text-[10px] text-[var(--ide-text-dim)]">
                              {editSourceDraft.length} chars · {editSourceDraft.split("\n").length} lines
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Terminology Matches (RAG) Panel */}
                      <TerminologyPanel
                        results={rag.lastResults}
                        ragState={rag.ragState}
                      />
                    </div>
                  </div>
                </Panel>

                {/* ─── Resize Handle ─── */}
                <PanelResizeHandle className="group relative w-1.5 bg-[var(--ide-border)] hover:bg-teal-500/30 active:bg-teal-500/50 transition-colors cursor-col-resize flex items-center justify-center">
                  <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] group-hover:w-[3px] group-active:w-[4px] bg-transparent group-hover:bg-teal-400/60 group-active:bg-teal-400 transition-all rounded-full" />
                </PanelResizeHandle>

                {/* ─── Target Pane (Right) ─── */}
                <Panel defaultSize={62} minSize={30} order={2}>
                  <div className="h-full flex flex-col">
                    {/* Target pane header */}
                    <div className="flex items-center justify-between h-8 px-3 border-b border-[var(--ide-border)] bg-[var(--ide-tabs-bg)] select-none">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-teal-400" />
                        <span className="text-[11px] font-medium text-[var(--ide-text)]">
                          TARGET
                        </span>
                        <span className="text-[10px] text-teal-300/70 px-1.5 py-0.5 rounded bg-teal-500/10 border border-teal-500/20">
                          {langPair.targetLabel}
                        </span>
                        <span className="text-[10px] text-[var(--ide-text-dim)]" dir="rtl">
                          ({langPair.targetLabelAr})
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-[var(--ide-text-dim)]">
                          {targetText.length > 0 ? `${targetText.split("\n").length} lines` : "Start typing…"}
                        </span>
                      </div>
                    </div>

                    {/* Target editor */}
                    <div className="flex-1 relative min-h-0">
                      <MonacoEditor
                        value={targetText}
                        onChange={(v) => {
                          setTargetText(v);
                          handleEditorChange(v);
                        }}
                        generateCompletion={generateCompletion}
                        interruptGeneration={webllm.interruptGenerate}
                        ragResults={rag.lastResults}
                        isLLMReady={webllm.isReady}
                        isGeminiReady={gemini.hasApiKey}
                        onEditorDidMount={handleEditorDidMount}
                        enableCompletions
                        languageId="rdat-target"
                        onCursorPositionChange={handleCursorPositionChange}
                        onSuggestionModeChange={setSuggestionMode}
                      />
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
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
                    Gemini Rewrite (Source-Aware)
                  </span>
                  <button
                    onClick={() => setShowRewritePanel(false)}
                    className="flex items-center justify-center w-5 h-5 rounded text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)] transition-colors cursor-pointer"
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
                          Gemini is evaluating and rewriting…
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
                      {/* Show source reference */}
                      {rewriteSourceSentence && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-amber-400/70 mb-1">Source Reference</p>
                          <p className="text-xs text-[var(--ide-text-muted)] bg-amber-500/5 border border-amber-500/10 p-2 rounded max-h-24 overflow-y-auto">
                            {rewriteSourceSentence}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--ide-text-dim)] mb-1">Original Translation</p>
                        <p className="text-xs text-[var(--ide-text-muted)] bg-[var(--ide-bg-tertiary)] p-2 rounded max-h-32 overflow-y-auto">
                          {rewriteResult.original}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-sky-400/70 mb-1">Rewritten</p>
                        <p className="text-xs text-[var(--ide-text)] bg-sky-500/5 border border-sky-500/10 p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap">
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
                      className="px-3 py-1 text-[11px] rounded bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition-colors cursor-pointer"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => setShowRewritePanel(false)}
                      className="px-3 py-1 text-[11px] rounded text-[var(--ide-text-muted)] hover:bg-[var(--ide-hover)] transition-colors cursor-pointer"
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
        suggestionMode={suggestionMode}
      />

      {/* About Dialog */}
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

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
