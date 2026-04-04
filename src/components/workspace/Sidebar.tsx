"use client";

import {
  FileText,
  BookOpen,
  Database,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Keyboard,
  Key,
  Check,
  Trash2,
} from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { UI_LABELS } from "@/lib/constants";
import type { EditorView } from "./WorkspaceShell";

interface SidebarProps {
  activeView: EditorView;
  onViewChange: (view: EditorView) => void;
  /** Gemini API key management — quick access from sidebar */
  geminiMaskedKey?: string;
  geminiHasApiKey?: boolean;
  onSetGeminiApiKey?: (key: string) => void;
}

export function Sidebar({
  activeView,
  onViewChange,
  geminiMaskedKey,
  geminiHasApiKey,
  onSetGeminiApiKey,
}: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    workspace: true,
    ai: true,
  });

  // ─── Gemini API Key Quick Entry State ────────────────────────────
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [localKeyInput, setLocalKeyInput] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  // Focus the input when shown
  useEffect(() => {
    if (showKeyInput && keyInputRef.current) {
      keyInputRef.current.focus();
    }
  }, [showKeyInput]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleToggleKeyInput = useCallback(() => {
    setShowKeyInput((prev) => !prev);
    setLocalKeyInput("");
    setSaveSuccess(false);
  }, []);

  const handleSaveKey = useCallback(() => {
    if (!onSetGeminiApiKey || !localKeyInput.trim()) return;
    onSetGeminiApiKey(localKeyInput.trim());
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
    setLocalKeyInput("");
  }, [onSetGeminiApiKey, localKeyInput]);

  const handleRemoveKey = useCallback(() => {
    if (!onSetGeminiApiKey) return;
    setLocalKeyInput("");
    onSetGeminiApiKey("");
    setShowKeyInput(false);
  }, [onSetGeminiApiKey]);

  const menuItems = [
    {
      id: "editor" as const,
      label: "Translation Editor",
      arLabel: UI_LABELS.translationEditor.ar,
      icon: FileText,
      badge: null,
    },
    {
      id: "welcome" as const,
      label: "Welcome & Roadmap",
      arLabel: "تفاصيل البرنامج",
      icon: BookOpen,
      badge: null,
    },
    {
      id: "glossary" as string,
      label: "GTR Glossary",
      arLabel: UI_LABELS.glossary.ar,
      icon: Database,
      badge: null,
    },
    {
      id: "vector-db" as string,
      label: "Vector DB",
      arLabel: "قاعدة بيانات المتجهات",
      icon: Database,
      badge: null,
    },
    {
      id: "ai-models" as string,
      label: "AI Models",
      arLabel: UI_LABELS.aiModels.ar,
      icon: Sparkles,
      badge: null,
    },
  ];

  return (
    <aside className="flex flex-col w-56 min-w-56 border-r border-[var(--ide-border)] bg-[var(--ide-sidebar)] overflow-y-auto">
      {/* Explorer Header */}
      <div className="flex items-center justify-between h-8 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--ide-text-muted)]">
        <span>Explorer</span>
        <span className="text-[9px] text-teal-300/50 font-normal normal-case" dir="rtl">المستعرض</span>
      </div>

      {/* Workspace Section */}
      <div className="flex flex-col">
        <button
          onClick={() => toggleSection("workspace")}
          className="flex items-center gap-1 h-6 px-3 text-[11px] font-medium text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)] transition-colors"
        >
          {expandedSections.workspace ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span>WORKSPACE</span>
        </button>

        {expandedSections.workspace &&
          menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const isDisabled = item.badge !== null;
            const isClickable = !isDisabled;

            return (
              <button
                key={item.id}
                onClick={() => isClickable && onViewChange(item.id as EditorView)}
                className={cn(
                  "flex flex-col items-start gap-0 pl-6 pr-3 py-1.5 transition-colors",
                  isActive
                    ? "text-[var(--ide-text)] bg-[var(--ide-active)] border-l-2 border-teal-400"
                    : isDisabled
                    ? "text-[var(--ide-text-dim)] cursor-not-allowed"
                    : "text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)]"
                )}
                disabled={isDisabled}
                title={
                  isDisabled
                    ? `${item.label} — Available in ${item.badge}`
                    : item.label
                }
              >
                <div className="flex items-center gap-2 w-full">
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate text-[12px]">{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--ide-badge-bg)] text-[var(--ide-badge-text)]">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="pl-[22px] text-[9px] text-teal-300/60" dir="rtl">
                  {item.arLabel}
                </span>
              </button>
            );
          })}
      </div>

      {/* AI Section */}
      <div className="flex flex-col mt-2">
        <button
          onClick={() => toggleSection("ai")}
          className="flex items-center justify-between h-6 px-3 text-[11px] font-medium text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)] transition-colors"
        >
          <div className="flex items-center gap-1">
            {expandedSections.ai ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span>AI ENGINES</span>
          </div>
          <span className="text-[9px] text-teal-300/50 font-normal normal-case" dir="rtl">محركات الذكاء الاصطناعي</span>
        </button>

        {expandedSections.ai && (
          <div className="flex flex-col">
            {/* Sovereign Track */}
            <div className="flex flex-col pl-6 pr-3 py-1.5">
              <div className="flex items-center gap-2 h-5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[12px] text-[var(--ide-text)]">Sovereign Track</span>
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  Active
                </span>
              </div>
              <span className="pl-[22px] text-[9px] text-teal-300/60" dir="rtl">
                {UI_LABELS.sovereignTrack.ar} — local WebGPU
              </span>
            </div>

            {/* Reasoning Track */}
            <div className="flex flex-col pl-6 pr-3 py-1.5">
              <div className="flex items-center gap-2 h-5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[12px] text-[var(--ide-text)]">Reasoning Track</span>
                <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full ${geminiHasApiKey ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                  {geminiHasApiKey ? "Active" : "No Key"}
                </span>
              </div>
              <span className="pl-[22px] text-[9px] text-teal-300/60" dir="rtl">
                {UI_LABELS.reasoningTrack.ar} — cloud Gemini
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Gemini API Key Quick Entry ─── */}
      <div className="mt-2 mx-3">
        <button
          onClick={handleToggleKeyInput}
          className={cn(
            "flex items-center justify-between w-full px-2.5 py-1.5 rounded border text-[11px] transition-colors",
            geminiHasApiKey
              ? "border-emerald-500/20 bg-emerald-500/5 text-[var(--ide-text-muted)] hover:bg-emerald-500/10"
              : "border-sky-500/30 bg-sky-500/5 text-sky-400 hover:bg-sky-500/10"
          )}
        >
          <div className="flex items-center gap-1.5">
            <Key className="w-3 h-3" />
            <span>{UI_LABELS.apiKeys.en}</span>
            <span className="text-[9px] text-teal-300/50" dir="rtl">{UI_LABELS.apiKeys.ar}</span>
          </div>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${geminiHasApiKey ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
            {geminiHasApiKey ? "✓" : "…"}
          </span>
        </button>

        {/* Collapsible key input */}
        {showKeyInput && (
          <div className="mt-1.5 p-2 rounded border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)] space-y-1.5">
            <input
              ref={keyInputRef}
              type="password"
              value={localKeyInput}
              onChange={(e) => {
                setLocalKeyInput(e.target.value);
                setSaveSuccess(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveKey();
              }}
              placeholder="Gemini API Key..."
              className="w-full px-2 py-1.5 rounded border border-[var(--ide-border)] bg-[var(--ide-bg-primary)] text-[11px] text-[var(--ide-text)] placeholder:text-[var(--ide-text-dim)] focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-colors"
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSaveKey}
                disabled={!localKeyInput.trim() || saveSuccess}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] border border-[var(--ide-border)] bg-[var(--ide-bg-primary)] text-[var(--ide-text)] hover:bg-[var(--ide-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saveSuccess ? (
                  <>
                    <Check className="w-2.5 h-2.5 text-emerald-400" />
                    <span className="text-emerald-400">Saved</span>
                  </>
                ) : (
                  <span>Save</span>
                )}
              </button>
              {geminiHasApiKey && (
                <button
                  onClick={handleRemoveKey}
                  className="flex items-center justify-center w-6 h-6 rounded text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove API key"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
            <p className="text-[8px] text-[var(--ide-text-dim)] leading-relaxed">
              Get free key from{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 underline underline-offset-1">
                Google AI Studio
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Translator Tips */}
      <div className="mt-4 mx-3 p-2.5 rounded-lg border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)]">
        <div className="flex items-center gap-1.5 mb-2">
          <Keyboard className="w-3 h-3 text-teal-400" />
          <span className="text-[10px] font-medium text-[var(--ide-text-muted)]">Translator Shortcuts</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[var(--ide-text-dim)]" dir="rtl">قبول النص المقترح</span>
            <kbd className="text-[8px] px-1 py-0.5 rounded bg-[var(--ide-bg-tertiary)] text-[var(--ide-text-muted)] border border-[var(--ide-border)]">Tab</kbd>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[var(--ide-text-dim)]" dir="rtl">إعادة صياغة النص</span>
            <div className="flex gap-0.5">
              <kbd className="text-[8px] px-1 py-0.5 rounded bg-[var(--ide-bg-tertiary)] text-[var(--ide-text-muted)] border border-[var(--ide-border)]">Ctrl</kbd>
              <span className="text-[8px] text-[var(--ide-text-dim)]">+</span>
              <kbd className="text-[8px] px-1 py-0.5 rounded bg-[var(--ide-bg-tertiary)] text-[var(--ide-text-muted)] border border-[var(--ide-border)]">.</kbd>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-[var(--ide-text-dim)]" dir="rtl">فتح الإعدادات</span>
            <kbd className="text-[8px] px-1 py-0.5 rounded bg-[var(--ide-bg-tertiary)] text-[var(--ide-text-muted)] border border-[var(--ide-border)]">Ctrl+,</kbd>
          </div>
        </div>
      </div>

      {/* Bottom info */}
      <div className="mt-auto p-3 border-t border-[var(--ide-border)]">
        <p className="text-[10px] text-[var(--ide-text-dim)] leading-relaxed">
          Split-Pane CAT Workspace with GTR vector DB. Professional bilingual
          UI with Arabic subtitle support. {UI_LABELS.sovereignTrack.en} (Gemma 2
          WebGPU) + {UI_LABELS.reasoningTrack.en} (Gemini 3.1 Flash Lite).
        </p>
      </div>
    </aside>
  );
}
