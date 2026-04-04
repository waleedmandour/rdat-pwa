"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Key,
  Globe,
  Languages,
  Sliders,
  Sparkles,
  Cpu,
  Cloud,
  Check,
  Trash2,
  Rocket,
  ArrowLeftRight,
} from "lucide-react";
import { UI_LABELS, LOCAL_MODEL_DISPLAY_NAME, LOCAL_MODEL_FAMILY, LANGUAGE_PAIRS } from "@/lib/constants";
import type { LanguageDirection } from "@/types";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  geminiMaskedKey?: string;
  geminiHasApiKey?: boolean;
  onSetGeminiApiKey?: (key: string) => void;
  langDirection?: LanguageDirection;
  onSwapDirection?: () => void;
}

// SSR-safe client detection via useSyncExternalStore
function getIsClient() {
  return true;
}

function subscribeToClientMount(callback: () => void) {
  return () => {};
}

/**
 * SettingsModal — Settings dialog with BYOK Gemini key management.
 */
export function SettingsModal({
  open,
  onOpenChange,
  geminiMaskedKey,
  geminiHasApiKey,
  onSetGeminiApiKey,
  langDirection = "en-ar",
  onSwapDirection,
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState("general");
  const inputRef = useRef<HTMLInputElement>(null);
  const [localKeyInput, setLocalKeyInput] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const isClient = useSyncExternalStore(
    subscribeToClientMount,
    getIsClient,
    () => false
  );

  // Handle section change — reset local key input when navigating to api-keys
  const handleSectionChange = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    if (sectionId === "api-keys") {
      setLocalKeyInput(geminiMaskedKey || "");
      setSaveSuccess(false);
    }
  }, [geminiMaskedKey]);

  // Trap focus and handle escape
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const handleSaveKey = () => {
    if (!onSetGeminiApiKey) return;
    onSetGeminiApiKey(localKeyInput);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleRemoveKey = () => {
    if (!onSetGeminiApiKey) return;
    setLocalKeyInput("");
    onSetGeminiApiKey("");
  };

  if (!open || !isClient) return null;

  const sections = [
    { id: "general", label: UI_LABELS.general.en, arLabel: UI_LABELS.general.ar, icon: Sliders },
    { id: "languages", label: UI_LABELS.languages.en, arLabel: UI_LABELS.languages.ar, icon: Languages },
    { id: "api-keys", label: UI_LABELS.apiKeys.en, arLabel: UI_LABELS.apiKeys.ar, icon: Key },
    { id: "ai-models", label: UI_LABELS.aiModels.en, arLabel: UI_LABELS.aiModels.ar, icon: Sparkles },
  ];

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[80vh] mx-4 rounded-lg border border-[var(--ide-border)] bg-[var(--ide-panel)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-11 border-b border-[var(--ide-border)] flex-shrink-0">
          <div className="flex flex-col leading-none">
            <h2 className="text-sm font-medium text-[var(--ide-text)]">
              {UI_LABELS.settings.en}
            </h2>
            <span className="text-[9px] text-teal-300/60" dir="rtl">{UI_LABELS.settings.ar}</span>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center w-6 h-6 rounded text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)] transition-colors"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar navigation */}
          <nav className="w-44 border-r border-[var(--ide-border)] p-2 flex-shrink-0">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => handleSectionChange(section.id)}
                  className={`flex flex-col items-start gap-0 w-full px-3 py-1.5 rounded transition-colors mb-0.5 ${
                    isActive
                      ? "bg-[var(--ide-active)] text-[var(--ide-text)]"
                      : "text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)]"
                  }`}
                >
                  <div className="flex items-center gap-2 w-full">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-[12px]">{section.label}</span>
                  </div>
                  <span className="pl-[20px] text-[9px] text-teal-300/50" dir="rtl">
                    {section.arLabel}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Content area */}
          <div className="flex-1 p-5 overflow-y-auto">
            {activeSection === "general" && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-[var(--ide-text)]">
                      General Settings
                    </h3>
                    <span className="text-[9px] text-teal-300/60" dir="rtl">إعدادات عامة</span>
                  </div>
                  <p className="text-xs text-[var(--ide-text-muted)] leading-relaxed">
                    Configure the general behavior of RDAT Copilot. These
                    settings control editor behavior, auto-suggestion
                    preferences, and display options.
                  </p>
                </div>

                <div className="space-y-4 pt-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-[var(--ide-text)]">
                        {UI_LABELS.autoSuggest.en}
                      </p>
                      <p className="text-[10px] text-teal-300/60 mt-0.5" dir="rtl">
                        {UI_LABELS.autoSuggest.ar}
                      </p>
                      <p className="text-[11px] text-[var(--ide-text-muted)] mt-0.5">
                        Show نص مخفي (ghost text) suggestions as you type
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                      Active
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-[var(--ide-text)]">
                        AMTA Linting
                      </p>
                      <p className="text-[10px] text-teal-300/60 mt-0.5" dir="rtl">
                        {UI_LABELS.amtaLinting.ar}
                      </p>
                      <p className="text-[11px] text-[var(--ide-text-muted)] mt-0.5">
                        Real-time translation quality markers
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                      Active
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-[var(--ide-text)]">
                        Editor Font Size
                      </p>
                      <p className="text-[10px] text-teal-300/60 mt-0.5" dir="rtl">
                        حجم خط المحرر
                      </p>
                      <p className="text-[11px] text-[var(--ide-text-muted)] mt-0.5">
                        Change the editor font size (coming in Phase 2)
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--ide-bg-tertiary)] text-[var(--ide-text-dim)]">
                      14px
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "languages" && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-[var(--ide-text)]">
                      Language Pair
                    </h3>
                    <span className="text-[9px] text-teal-300/60" dir="rtl">زوج اللغة</span>
                  </div>
                  <p className="text-xs text-[var(--ide-text-muted)] leading-relaxed">
                    Select your source and target languages for translation.
                    The vector database and AI models will be configured
                    accordingly.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--ide-text)] mb-1.5">
                      Source Language
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)]">
                      <Globe className="w-3.5 h-3.5 text-[var(--ide-text-muted)]" />
                      <span className="text-xs text-[var(--ide-text)]">{LANGUAGE_PAIRS[langDirection].sourceLabel} ({LANGUAGE_PAIRS[langDirection].source})</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--ide-text)] mb-1.5">
                      Target Language
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)]">
                      <Globe className="w-3.5 h-3.5 text-[var(--ide-text-muted)]" />
                      <span className="text-xs text-[var(--ide-text)]">{LANGUAGE_PAIRS[langDirection].targetLabel} ({LANGUAGE_PAIRS[langDirection].target})</span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-center pt-3">
                  <button
                    onClick={onSwapDirection}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-teal-500/30 bg-teal-500/5 text-xs text-teal-400 hover:bg-teal-500/10 hover:border-teal-500/50 transition-colors cursor-pointer"
                  >
                    <ArrowLeftRight className={`w-3.5 h-3.5 ${langDirection === "ar-en" ? "rotate-180" : ""} transition-transform`} />
                    <span>Swap: {LANGUAGE_PAIRS[langDirection].sourceLabel} ↔ {LANGUAGE_PAIRS[langDirection].targetLabel}</span>
                    <span className="text-[9px] text-teal-300/50" dir="rtl">تبديل الاتجاه</span>
                  </button>
                </div>
              </div>
            )}

            {activeSection === "api-keys" && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-[var(--ide-text)]">
                      API Keys (BYOK)
                    </h3>
                    <span className="text-[9px] text-teal-300/60" dir="rtl">{UI_LABELS.apiKeys.ar}</span>
                  </div>
                  <p className="text-xs text-[var(--ide-text-muted)] leading-relaxed">
                    Bring Your Own Key. Enter your API keys for cloud AI
                    services. Keys are stored locally in your browser and never
                    sent to our servers.
                  </p>
                </div>

                <div className="space-y-4 pt-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--ide-text)] mb-1.5">
                      <Key className="w-3 h-3" />
                      Google Gemini API Key
                      {geminiHasApiKey && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                          Configured
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        ref={inputRef}
                        type="password"
                        value={localKeyInput}
                        onChange={(e) => {
                          setLocalKeyInput(e.target.value);
                          setSaveSuccess(false);
                        }}
                        placeholder="Enter your Gemini API key..."
                        className="flex-1 px-3 py-2 rounded border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)] text-xs text-[var(--ide-text)] placeholder:text-[var(--ide-text-dim)] focus:outline-none focus:ring-1 focus:ring-sky-500/50 focus:border-sky-500/50 transition-colors"
                      />
                      <button
                        onClick={handleSaveKey}
                        disabled={!localKeyInput || localKeyInput.startsWith("••••")}
                        className="flex items-center gap-1 px-3 py-2 rounded border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)] text-xs text-[var(--ide-text)] hover:bg-[var(--ide-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {saveSuccess ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Saved</span>
                          </>
                        ) : (
                          "Save"
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[10px] text-[var(--ide-text-dim)]">
                        Get your free key from{" "}
                        <a
                          href="https://aistudio.google.com/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-400 hover:text-sky-300 underline underline-offset-2"
                        >
                          Google AI Studio
                        </a>
                      </p>
                      {geminiHasApiKey && (
                        <button
                          onClick={handleRemoveKey}
                          className="flex items-center gap-1 text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove Key
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "ai-models" && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-[var(--ide-text)]">
                      AI Model Configuration
                    </h3>
                    <span className="text-[9px] text-teal-300/60" dir="rtl">{UI_LABELS.aiModels.ar}</span>
                  </div>
                  <p className="text-xs text-[var(--ide-text-muted)] leading-relaxed">
                    Configure the dual-track AI architecture. The Sovereign
                    Track runs locally via WebGPU, while the Reasoning Track
                    uses the cloud.
                  </p>
                </div>

                <div className="space-y-4 pt-3">
                  {/* Sovereign Track */}
                  <div className="p-3 rounded-lg border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)]">
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-medium text-[var(--ide-text)]">
                        {UI_LABELS.sovereignTrack.en} (Local)
                      </span>
                    </div>
                    <p className="text-[10px] text-teal-300/60 mb-0.5" dir="rtl">
                      {UI_LABELS.sovereignTrack.ar} — محلي
                    </p>
                    <p className="text-[11px] text-[var(--ide-text-muted)]">
                      Model: {LOCAL_MODEL_DISPLAY_NAME}
                    </p>
                    <p className="text-[10px] text-[var(--ide-text-dim)] mt-0.5">
                      Runs via WebGPU in the browser · Target: &lt;200ms
                      latency
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                        Active
                      </span>
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                        Gemma 4 — قريبًا (Coming Soon)
                      </span>
                    </div>
                  </div>

                  {/* Reasoning Track */}
                  <div className="p-3 rounded-lg border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)]">
                    <div className="flex items-center gap-2 mb-2">
                      <Cloud className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-medium text-[var(--ide-text)]">
                        {UI_LABELS.reasoningTrack.en} (Cloud)
                      </span>
                    </div>
                    <p className="text-[10px] text-teal-300/60 mb-0.5" dir="rtl">
                      {UI_LABELS.reasoningTrack.ar} — سحابي
                    </p>
                    <p className="text-[11px] text-[var(--ide-text-muted)]">
                      Model: Gemini 3.1 Flash Lite <span className="text-[9px] text-sky-300/60" dir="rtl">(مجاني)</span>
                    </p>
                    <p className="text-[10px] text-[var(--ide-text-dim)] mt-0.5">
                      Via Gemini API · Heavy tasks: register rewriting, context
                      analysis
                    </p>
                    <span className="inline-block mt-2 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                      Active
                    </span>
                  </div>

                  {/* Gemma 4 Coming Soon */}
                  <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                    <div className="flex items-center gap-2">
                      <Rocket className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-medium text-amber-400">
                        Gemma 4 — قريبًا (Coming Soon)
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--ide-text-dim)] mt-1.5">
                      WebLLM v0.2.82 (latest) does not yet support {LOCAL_MODEL_FAMILY} 4 models.
                      Once MLC releases support, we will upgrade the Sovereign Track for
                      significantly better translation quality and longer context windows.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render outside the main app tree
  if (typeof document !== "undefined") {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
