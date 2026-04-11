"use client";

import React, { useState, useEffect } from "react";
import { Sidebar, NavItem } from "./Sidebar";
import { StatusBar, EngineMode, GTRStatus } from "./StatusBar";
import type { WebGPUInfo } from "./StatusBar";
import { WelcomeTab } from "./WelcomeTab";
import { TranslationWorkspace } from "./editors/TranslationWorkspace";
import { SettingsPanel } from "./Settings";
import { AiModelsView } from "./AiModelsView";
import { GlossaryView } from "./GlossaryView";
import { QuickGuideModal, hasSeenGuide } from "./QuickGuideModal";
import { InstallPWAButton } from "./InstallPWAButton";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "next-themes";
import { Sun, Moon, HelpCircle } from "lucide-react";

interface WorkspaceShellProps {
  children?: React.ReactNode;
  className?: string;
}

export function WorkspaceShell({ children, className }: WorkspaceShellProps) {
  const { t, locale } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [activeNav, setActiveNav] = useState<NavItem>("translator");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // AI engine state
  const [webgpuInfo, setWebgpuInfo] = useState<WebGPUInfo>({ state: "loading" });
  const [geminiAvailable, setGeminiAvailable] = useState(false);

  // Auto-open guide on first visit
  useEffect(() => {
    if (!hasSeenGuide()) {
      setShowGuide(true);
    }
  }, []);

  const isDark = theme === "dark";

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

  // Render active view
  const renderView = () => {
    switch (activeNav) {
      case "translator":
        return (
          <TranslationWorkspace
            onWebgpuStateChange={setWebgpuInfo}
            onGeminiAvailableChange={setGeminiAvailable}
          />
        );
      case "glossary":
        return <GlossaryView />;
      case "vectordb":
        return <GlossaryView />;
      case "models":
        return <AiModelsView />;
      case "settings":
        return <SettingsPanel />;
      default:
        return <WelcomeTab />;
    }
  };

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
          onOpenGuide={() => setShowGuide(true)}
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
              {/* PWA Install Button */}
              <InstallPWAButton />

              {/* Theme Toggle */}
              <button
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="p-1.5 rounded-md hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors"
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {isDark ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>

              {/* Help Button */}
              <button
                onClick={() => setShowGuide(true)}
                className="p-1.5 rounded-md hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors"
                title={locale === "en" ? "Quick Guide" : "دليل سريع"}
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              {/* Ready Indicator */}
              <div className="flex items-center gap-1.5 ml-1">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs text-muted-foreground">
                  {t("status.ready")}
                </span>
              </div>
            </div>
          </header>

          {/* Workspace Content */}
          <div className="flex-1 overflow-hidden bg-background">
            {renderView()}
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

      {/* Quick Guide Modal */}
      <QuickGuideModal open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}
