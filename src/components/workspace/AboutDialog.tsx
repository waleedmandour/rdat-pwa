"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Github, Cpu, Cloud, Database, Shield, Globe } from "lucide-react";
import { APP_NAME, APP_VERSION, APP_DESCRIPTION } from "@/lib/constants";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 rounded-lg border border-[var(--ide-border)] bg-[var(--ide-panel)] shadow-2xl overflow-hidden">
        {/* Header gradient */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-teal-500/10 via-cyan-500/5 to-transparent border-b border-[var(--ide-border)]">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-xl border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)] bg-no-repeat bg-center bg-contain p-1.5"
              style={{ backgroundImage: "url(/logo.svg)" }}
              role="img"
              aria-label="RDAT Copilot Logo"
            />
            <div className="flex flex-col leading-none">
              <span className="text-lg font-semibold text-[var(--ide-text)] tracking-tight">
                {APP_NAME}
              </span>
              <span className="text-xs text-teal-300/70" dir="rtl">
                مساعد الترجمة الذكي
              </span>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 flex items-center justify-center w-6 h-6 rounded text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)] transition-colors"
            aria-label="Close about dialog"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Description */}
          <p className="text-xs text-[var(--ide-text-muted)] leading-relaxed">
            {APP_DESCRIPTION}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Version */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--ide-text-muted)]">Version</span>
            <span className="text-xs text-[var(--ide-text)] font-mono">v{APP_VERSION}</span>
          </div>

          {/* License */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--ide-text-muted)]">License</span>
            <span className="text-xs text-[var(--ide-text)]">MIT</span>
          </div>

          {/* Author */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--ide-text-muted)]">Author</span>
            <div className="flex flex-col items-end leading-tight">
              <span className="text-xs text-[var(--ide-text)]">Dr. Waleed Mandour</span>
              <span className="text-[10px] text-[var(--ide-text-dim)]" dir="rtl">د. وليد مندور — جامعة السلطان قابوس</span>
            </div>
          </div>

          {/* Tech Stack */}
          <div className="pt-2 border-t border-[var(--ide-border)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--ide-text-dim)] mb-2">Architecture</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-[var(--ide-text-muted)]">WebLLM (Gemma 2)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Cloud className="w-3 h-3 text-sky-400" />
                <span className="text-[10px] text-[var(--ide-text-muted)]">Gemini 3.1 Flash</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database className="w-3 h-3 text-teal-400" />
                <span className="text-[10px] text-[var(--ide-text-muted)]">Orama Vector DB</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] text-[var(--ide-text-muted)]">AMTA Linter</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-teal-300/70" />
                <span className="text-[10px] text-[var(--ide-text-muted)]">Transformers.js</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Github className="w-3 h-3 text-[var(--ide-text-muted)]" />
                <span className="text-[10px] text-[var(--ide-text-muted)]">Next.js 16 PWA</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--ide-border)] bg-[var(--ide-bg-secondary)] flex items-center justify-between">
          <a
            href="https://github.com/waleedmandour/rdat-pwa"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-[var(--ide-text-muted)] hover:text-teal-400 transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub Repository</span>
          </a>
          <span className="text-[10px] text-[var(--ide-text-dim)]">
            &copy; {new Date().getFullYear()} Waleed Mandour
          </span>
        </div>
      </div>
    </div>
  );

  if (!open) return null;

  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }
  return content;
}
