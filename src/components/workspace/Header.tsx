"use client";

import {
  Languages,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onOpenSettings: () => void;
}

export function Header({
  onToggleSidebar,
  sidebarOpen,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between h-10 px-3 border-b border-[var(--ide-border)] bg-[var(--ide-titlebar)] select-none">
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
          <span className="text-[13px] font-medium text-[var(--ide-text)] tracking-tight">
            {APP_NAME}
          </span>
        </div>

        {/* Breadcrumb placeholder */}
        <nav className="flex items-center gap-1 ml-4 text-[12px]">
          <span className="text-[var(--ide-text-dim)] hover:text-[var(--ide-text-muted)] cursor-pointer transition-colors">
            workspace
          </span>
          <span className="text-[var(--ide-text-dim)]">/</span>
          <span className="text-[var(--ide-text-muted)]">untitled-project</span>
        </nav>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1">
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
