"use client";

import React, { useState, useMemo } from "react";
import { Sidebar, NavItem } from "./Sidebar";
import { StatusBar, EngineMode, GTRStatus } from "./StatusBar";
import type { WebGPUInfo } from "./StatusBar";
import { WelcomeTab } from "./WelcomeTab";
import { TranslationWorkspace } from "./editors/TranslationWorkspace";
import { SettingsPanel } from "./Settings";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";

interface WorkspaceShellProps {
  children?: React.ReactNode;
  className?: string;
}

export function WorkspaceShell({ children, className }: WorkspaceShellProps) {
  const { t, locale } = useLanguage();
  const [activeNav, setActiveNav] = useState<NavItem>("translator");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // AI engine state (will be wired from child components via callbacks in Phase 5)
  const [webgpuInfo, setWebgpuInfo] = useState<WebGPUInfo>({ state: "loading" });
  const [geminiAvailable, setGeminiAvailable] = useState(false);

  // Placeholder status props
  const engineMode: EngineMode = "hybrid";
  const gtrStatus: GTRStatus = "zero-shot";

  const navTitleMap: Record<NavItem, string> = {
    translator: t("workspace.title.translator"),
    glossary: t("workspace.title.glossary"),
    vectordb: t("workspace.title.vectordb"),
    models: t("workspace.title.models"),
    "api-keys": t("workspace.title.apiKeys"),
    settings: t("workspace.title.settings"),
  };

  // Memoize the translation workspace with status callbacks
  const workspace = useMemo(
    () => (
      <TranslationWorkspace
        onWebgpuStateChange={setWebgpuInfo}
        onGeminiAvailableChange={setGeminiAvailable}
      />
    ),
    [setWebgpuInfo, setGeminiAvailable]
  );

  return (
    <div
      className={cn(
        "flex flex-col h-screen w-screen overflow-hidden bg-background",
        className
      )}
      dir={locale === "ar" ? "rtl" : undefined}
    >
      {/* Main Content Area: Sidebar + Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar (Explorer) */}
        <Sidebar
          activeItem={activeNav}
          onNavItemChange={setActiveNav}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />

        {/* Main Workspace */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar (Title/Actions) */}
          <header className="h-10 bg-surface border-b border-border flex items-center px-4 justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {navTitleMap[activeNav]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-muted-foreground">
                {t("status.ready")}
              </span>
            </div>
          </header>

          {/* Workspace Content */}
          <div className="flex-1 overflow-hidden bg-background">
            {activeNav === "translator"
              ? workspace
              : activeNav === "settings"
                ? <SettingsPanel />
                : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <p className="text-lg font-medium mb-1">
                        {navTitleMap[activeNav]}
                      </p>
                      <p className="text-sm">
                        {locale === "ar"
                          ? "هذه الوحدة قيد التطوير"
                          : "This module is under development"}
                      </p>
                    </div>
                  </div>
                )}
          </div>
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        engineMode={engineMode}
        gtrStatus={gtrStatus}
        webgpuInfo={webgpuInfo}
        geminiAvailable={geminiAvailable}
        segmentCount={0}
        wordCount={0}
      />
    </div>
  );
}
