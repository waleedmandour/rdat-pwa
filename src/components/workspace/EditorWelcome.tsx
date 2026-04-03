"use client";

import {
  Sparkles,
  Cloud,
  Cpu,
  Zap,
  BookOpen,
  FileText,
} from "lucide-react";
import type { AppMode } from "@/types";
import { MODE_LABELS } from "@/lib/constants";

interface EditorWelcomeProps {
  appMode: AppMode;
}

export function EditorWelcome({ appMode }: EditorWelcomeProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8">
      {/* Hero Section */}
      <div className="flex flex-col items-center max-w-lg text-center">
        {/* Icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-500/30 mb-6">
          <Sparkles className="w-8 h-8 text-teal-400" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-semibold text-[var(--ide-text)] mb-2 tracking-tight">
          Welcome to RDAT Copilot
        </h1>

        {/* Subtitle */}
        <p className="text-sm text-[var(--ide-text-muted)] mb-8 leading-relaxed">
          Repository-Driven Adaptive Translation — Your AI-powered co-writing
          IDE. The Monaco Editor is now active. Switch to the{" "}
          <span className="text-teal-400 font-medium">
            Translation Editor
          </span>{" "}
          tab to start translating with AI ghost text suggestions.
        </p>

        {/* Mode Card */}
        <div className="w-full p-4 rounded-lg border border-[var(--ide-border)] bg-[var(--ide-bg-secondary)] mb-6">
          <div className="flex items-center gap-2 mb-2">
            {appMode === "hybrid" && (
              <Zap className="w-4 h-4 text-emerald-400" />
            )}
            {appMode === "cloud" && (
              <Cloud className="w-4 h-4 text-sky-400" />
            )}
            {appMode === "local" && (
              <Cpu className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-sm font-medium text-[var(--ide-text)]">
              Active Mode: {MODE_LABELS[appMode]}
            </span>
          </div>
          <p className="text-xs text-[var(--ide-text-muted)] leading-relaxed">
            {appMode === "hybrid" &&
              "Your browser supports WebGPU. The Sovereign Track (local AI) and Reasoning Track (cloud AI) will both be available."}
            {appMode === "cloud" &&
              "WebGPU is not available in this browser. Running in Cloud-Only mode with Gemini API for all AI features. Local model features are disabled."}
            {appMode === "local" &&
              "Running in offline mode with the local AI model only. Cloud features are disabled."}
          </p>
        </div>

        {/* Phase Roadmap */}
        <div className="w-full space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ide-text-dim)]">
            Development Roadmap
          </h3>

          {[
            {
              phase: 1,
              title: "PWA Scaffold & WebGPU Telemetry",
              status: "completed" as const,
              description: "Workspace shell, GPU detection, PWA manifest",
            },
            {
              phase: 2,
              title: "Monaco Editor & Event Loop",
              status: "completed" as const,
              description: "IDE editor, debounced keystrokes, abort logic, ghost text",
            },
            {
              phase: 3,
              title: "Client-Side Vector DB & RAG",
              status: "completed" as const,
              description: "Orama vector DB, Transformers.js embeddings, Web Worker",
            },
            {
              phase: 4,
              title: "Local Sovereign Track (Gemma 2B)",
              status: "active" as const,
              description: "WebLLM inference, ghost text, interrupt on keystroke",
            },
            {
              phase: 5,
              title: "Cloud Reasoning Track & Linting",
              status: "pending" as const,
              description: "Gemini API, AMTA linter, settings UI",
            },
          ].map((item) => (
            <div
              key={item.phase}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                item.status === "active"
                  ? "border-teal-500/30 bg-teal-500/5"
                  : item.status === "completed"
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-[var(--ide-border)] bg-[var(--ide-bg-secondary)]"
              }`}
            >
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                  item.status === "active"
                    ? "bg-teal-500 text-[var(--ide-bg-primary)]"
                    : item.status === "completed"
                    ? "bg-emerald-500 text-[var(--ide-bg-primary)]"
                    : "bg-[var(--ide-bg-tertiary)] text-[var(--ide-text-dim)]"
                }`}
              >
                {item.status === "completed" ? "✓" : item.phase}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      item.status === "active"
                        ? "text-teal-400"
                        : item.status === "completed"
                        ? "text-emerald-400"
                        : "text-[var(--ide-text-muted)]"
                    }`}
                  >
                    {item.title}
                  </span>
                  {item.status === "active" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-400 font-medium">
                      IN PROGRESS
                    </span>
                  )}
                  {item.status === "completed" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                      DONE
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--ide-text-dim)] mt-0.5">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-3 mt-8">
          <div className="flex items-center gap-2 text-xs text-[var(--ide-text-dim)]">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Open the</span>
            <span className="text-teal-400 font-medium">
              Translation Editor
            </span>
            <span>tab to see Monaco + ghost text in action</span>
          </div>
        </div>
      </div>
    </div>
  );
}
