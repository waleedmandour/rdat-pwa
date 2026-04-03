"use client";

import { useState, useEffect } from "react";
import type { GPUStatus, AppMode } from "@/types";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { WebGPUBanner } from "@/components/gpu/WebGPUBanner";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { EditorWelcome } from "./EditorWelcome";
import { MonacoEditor } from "./MonacoEditor";
import { useEditorEventLoop } from "@/hooks/useEditorEventLoop";
import { FileText, BookOpen, X } from "lucide-react";

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
  const [sourceText, setSourceText] = useState(
    "The quick brown fox jumps over the lazy dog.\n\nTranslation is the communication of the meaning of a source-language text by means of an equivalent target-language text."
  );

  const { inferenceState, handleEditorChange, cleanup } =
    useEditorEventLoop();

  // Cleanup event loop on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

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
              {/* Dirty indicator (always dirty in Phase 2 for visual) */}
              <span className="w-2 h-2 rounded-full bg-teal-400 ml-1 flex-shrink-0" />
            </button>
          </div>

          {/* Editor content area */}
          <div className="flex-1 min-h-0 relative">
            {activeView === "editor" ? (
              <MonacoEditor
                value={sourceText}
                onChange={handleEditorChange}
              />
            ) : (
              <div className="h-full overflow-auto">
                <EditorWelcome appMode={appMode} />
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
      />

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
