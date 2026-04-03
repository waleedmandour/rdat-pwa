"use client";

import { useState } from "react";
import type { GPUStatus, AppMode } from "@/types";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { WebGPUBanner } from "@/components/gpu/WebGPUBanner";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { EditorWelcome } from "./EditorWelcome";

export function WorkspaceShell({
  gpuStatus,
  appMode,
}: {
  gpuStatus: GPUStatus;
  appMode: AppMode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        {sidebarOpen && <Sidebar />}

        {/* Editor area */}
        <main className="flex-1 flex flex-col min-w-0 bg-[var(--ide-editor-bg)]">
          {/* Editor tabs bar (placeholder) */}
          <div className="flex items-center h-9 px-2 border-b border-[var(--ide-border)] bg-[var(--ide-tabs-bg)]">
            <div className="flex items-center gap-1.5 px-3 h-full text-[12px] text-[var(--ide-text)] bg-[var(--ide-editor-bg)] border-r border-[var(--ide-border)] cursor-pointer">
              <span className="truncate">Welcome</span>
            </div>
          </div>

          {/* Editor content area */}
          <div className="flex-1 overflow-auto">
            <EditorWelcome appMode={appMode} />
          </div>
        </main>
      </div>

      {/* Status Bar */}
      <StatusBar gpuStatus={gpuStatus} appMode={appMode} />

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
