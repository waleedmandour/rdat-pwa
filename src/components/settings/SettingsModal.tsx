"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
} from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// SSR-safe client detection via useSyncExternalStore
function getIsClient() {
  return true;
}

function subscribeToClientMount(callback: () => void) {
  return () => {};
}

/**
 * SettingsModal — Placeholder settings dialog.
 * Will be fully implemented in Phase 5 (BYOK Gemini key, model config, etc.)
 */
export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState("general");
  const inputRef = useRef<HTMLInputElement>(null);
  const isClient = useSyncExternalStore(
    subscribeToClientMount,
    getIsClient,
    () => false
  );

  // Trap focus and handle escape
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  if (!open || !isClient) return null;

  const sections = [
    { id: "general", label: "General", icon: Sliders },
    { id: "languages", label: "Languages", icon: Languages },
    { id: "api-keys", label: "API Keys", icon: Key },
    { id: "ai-models", label: "AI Models", icon: Sparkles },
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
          <h2 className="text-sm font-medium text-[var(--ide-text)]">
            Settings
          </h2>
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
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 rounded text-[12px] transition-colors ${
                    isActive
                      ? "bg-[var(--ide-active)] text-[var(--ide-text)]"
                      : "text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Content area */}
          <div className="flex-1 p-5 overflow-y-auto">
            {activeSection === "general" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-medium text-[var(--ide-text)] mb-1">
                    General Settings
                  </h3>
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
                        Auto-suggest Translations
                      </p>
                      <p className="text-[11px] text-[var(--ide-text-muted)] mt-0.5">
                        Show ghost text suggestions as you type
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-teal-500/20 text-teal-400 font-medium">
                      Phase 2
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-[var(--ide-text)]">
                        AMTA Linting
                      </p>
                      <p className="text-[11px] text-[var(--ide-text-muted)] mt-0.5">
                        Real-time translation quality markers
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                      Phase 5
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-[var(--ide-text)]">
                        Editor Font Size
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
                  <h3 className="text-sm font-medium text-[var(--ide-text)] mb-1">
                    Language Pair
                  </h3>
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
                      <span className="text-xs text-[var(--ide-text)]">English (en)</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--ide-text)] mb-1.5">
                      Target Language
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)]">
                      <Globe className="w-3.5 h-3.5 text-[var(--ide-text-muted)]" />
                      <span className="text-xs text-[var(--ide-text)]">Arabic (ar)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "api-keys" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-medium text-[var(--ide-text)] mb-1">
                    API Keys (BYOK)
                  </h3>
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
                    </label>
                    <input
                      ref={inputRef}
                      type="password"
                      placeholder="Enter your Gemini API key..."
                      className="w-full px-3 py-2 rounded border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)] text-xs text-[var(--ide-text)] placeholder:text-[var(--ide-text-dim)] focus:outline-none focus:ring-1 focus:ring-teal-500/50 focus:border-teal-500/50 transition-colors"
                    />
                    <p className="text-[10px] text-[var(--ide-text-dim)] mt-1.5">
                      Get your free key from{" "}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-400 hover:text-teal-300 underline underline-offset-2"
                      >
                        Google AI Studio
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "ai-models" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-medium text-[var(--ide-text)] mb-1">
                    AI Model Configuration
                  </h3>
                  <p className="text-xs text-[var(--ide-text-muted)] leading-relaxed">
                    Configure the dual-track AI architecture. The Sovereign
                    Track runs locally via WebGPU, while the Reasoning Track
                    uses the cloud.
                  </p>
                </div>

                <div className="space-y-4 pt-3">
                  <div className="p-3 rounded-lg border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)]">
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-medium text-[var(--ide-text)]">
                        Sovereign Track (Local)
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--ide-text-muted)]">
                      Model: Gemma 4 (INT4 Quantized)
                    </p>
                    <p className="text-[10px] text-[var(--ide-text-dim)] mt-0.5">
                      Runs via WebGPU in the browser · Target: &lt;200ms
                      latency
                    </p>
                    <span className="inline-block mt-2 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                      Phase 4
                    </span>
                  </div>

                  <div className="p-3 rounded-lg border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)]">
                    <div className="flex items-center gap-2 mb-2">
                      <Cloud className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-medium text-[var(--ide-text)]">
                        Reasoning Track (Cloud)
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--ide-text-muted)]">
                      Model: Google Gemini 2.0 Flash
                    </p>
                    <p className="text-[10px] text-[var(--ide-text-dim)] mt-0.5">
                      Via Gemini API · Heavy tasks: register rewriting, context
                      analysis
                    </p>
                    <span className="inline-block mt-2 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                      Phase 5
                    </span>
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
