"use client";

import {
  Languages,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  ArrowLeftRight,
  Info,
} from "lucide-react";
import { InstallPWAButton } from "./InstallPWAButton";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import type { LanguageDirection, LanguagePair } from "@/types";

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  langDirection: LanguageDirection;
  langPair: LanguagePair;
  onSwapDirection: () => void;
}

export function Header({
  onToggleSidebar,
  sidebarOpen,
  onOpenSettings,
  onOpenAbout,
  langDirection,
  langPair,
  onSwapDirection,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between h-10 px-3 border-b border-[var(--ide-border)] bg-[var(--ide-titlebar)] select-none relative">
      {/* Gradient line under header */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-teal-500/40 to-transparent" />

      {/* Left section */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)]"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeftOpen className="w-4 h-4" />
          )}
        </Button>

        {/* Logo & Title */}
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded bg-gradient-to-br from-teal-400 to-cyan-500">
            <Languages className="w-3 h-3 text-[var(--ide-bg-primary)]" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[13px] font-medium text-[var(--ide-text)] tracking-tight">
              {APP_NAME}
            </span>
            <span className="text-[9px] text-teal-300/70 tracking-wide" dir="rtl">
              مساعد الترجمة الذكي
            </span>
          </div>
        </div>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 ml-4 text-[12px]">
          <span className="text-[var(--ide-text-dim)] hover:text-[var(--ide-text-muted)] cursor-pointer transition-colors" dir="rtl">
            محرر الترجمة
          </span>
          <span className="text-[var(--ide-text-dim)]">/</span>
          <span className="text-[var(--ide-text-muted)]">مشروع جديد</span>
        </nav>

        {/* Language pair indicator — clickable to swap */}
        <button
          onClick={onSwapDirection}
          className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded bg-[var(--ide-bg-secondary)] border border-[var(--ide-border)] cursor-pointer hover:bg-teal-500/10 hover:border-teal-500/30 transition-colors group"
          title={`Click to swap: ${langPair.sourceLabel} ↔ ${langPair.targetLabel}`}
        >
          <ArrowLeftRight className={`w-3 h-3 text-teal-400 transition-transform group-hover:rotate-180 ${langDirection === "ar-en" ? "rotate-180" : ""}`} />
          <span className="text-[11px] text-[var(--ide-text-muted)] group-hover:text-teal-300" dir="rtl">
            {langPair.sourceLabelAr} ← {langPair.targetLabelAr}
          </span>
        </button>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1.5">
        {/* PWA Install Button (only shows in eligible browsers) */}
        <InstallPWAButton />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)]"
          aria-label="About RDAT Copilot"
          onClick={onOpenAbout}
        >
          <Info className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)]"
          aria-label="Toggle dark mode (coming soon)"
        >
          <Moon className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)]"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>
      </div>
    </header>
  );
}
