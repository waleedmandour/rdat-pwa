"use client";

import {
  Sparkles,
  Cloud,
  Cpu,
  Zap,
  BookOpen,
  FileText,
  Settings,
  Shield,
  Rocket,
} from "lucide-react";
import type { AppMode } from "@/types";
import { MODE_LABELS, MODE_LABELS_AR, UI_LABELS } from "@/lib/constants";

interface EditorWelcomeProps {
  appMode: AppMode;
}

export function EditorWelcome({ appMode }: EditorWelcomeProps) {
  return (
    <div className="flex flex-col items-center justify-start min-h-full py-8 px-4 overflow-y-auto">
      <div className="flex flex-col items-center max-w-xl w-full">
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center mb-8">
          {/* Icon */}
          <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-500/30 mb-6">
            <Sparkles className="w-10 h-10 text-teal-400" />
          </div>

          {/* Arabic Title (primary) */}
          <h1 className="text-2xl font-bold text-[var(--ide-text)] mb-1.5 tracking-tight" dir="rtl">
            مرحبًا بك في RDAT Copilot
          </h1>

          {/* Arabic Subtitle */}
          <p className="text-sm text-teal-300/70 mb-2 leading-relaxed" dir="rtl">
            المساعد الذكي للترجمة — بيئة التحرير المتكاملة بالذكاء الاصطناعي
          </p>

          {/* English Subtitle */}
          <p className="text-xs text-[var(--ide-text-muted)] leading-relaxed max-w-md">
            Repository-Driven Adaptive Translation — Your AI-powered co-writing IDE.
            Switch to the{" "}
            <span className="text-teal-400 font-medium">
              {UI_LABELS.translationEditor.en}
            </span>{" "}
            tab to start translating with AI ghost text suggestions.
          </p>
        </div>

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
          <p className="text-xs text-[var(--ide-text-muted)] leading-relaxed" dir="rtl">
            {appMode === "hybrid" &&
              "متصفحك يدعم WebGPU. المسار السيادي (الذكاء الاصطناعي المحلي) ومسار الاستدلال (الذكاء الاصطناعي السحابي) متاحان كلاهما."}
            {appMode === "cloud" &&
              "WebGPU غير متاح في هذا المتصفح. يتم التشغيل في وضع السحابة فقط باستخدام Gemini API لجميع ميزات الذكاء الاصطناعي."}
            {appMode === "local" &&
              "يتم التشغيل في وضع عدم الاتصال باستخدام النموذج المحلي فقط. ميزات السحابة معطلة."}
          </p>
        </div>

        {/* Quick Start Section */}
        <div className="w-full mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ide-text-dim)] mb-3">
            Quick Start — ابدأ الآن
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Card 1: Start Translating */}
            <div className="p-4 rounded-lg border border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10 transition-colors cursor-pointer group">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-teal-400" />
                <span className="text-sm font-medium text-[var(--ide-text)]">ابدأ الترجمة</span>
              </div>
              <p className="text-[9px] text-teal-300/60 mb-2" dir="rtl">
                انتقل إلى المحرر وابدأ الكتابة مع اقتراحات الذكاء الاصطناعي
              </p>
              <p className="text-[10px] text-[var(--ide-text-dim)]">
                Open the Translation Editor tab and start writing with AI ghost text
              </p>
            </div>

            {/* Card 2: Gemini Settings */}
            <div className="p-4 rounded-lg border border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10 transition-colors cursor-pointer group">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-4 h-4 text-sky-400" />
                <span className="text-sm font-medium text-[var(--ide-text)]">إعدادات Gemini</span>
              </div>
              <p className="text-[9px] text-teal-300/60 mb-2" dir="rtl">
                أدخل مفتاح API الخاص بك لتفعيل ميزات إعادة الصياغة السحابية
              </p>
              <p className="text-[10px] text-[var(--ide-text-dim)]">
                Configure your Gemini API key to enable cloud-powered rewriting
              </p>
            </div>

            {/* Card 3: Sovereign Track */}
            <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors cursor-pointer group">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-[var(--ide-text)]">المسار السيادي</span>
              </div>
              <p className="text-[9px] text-teal-300/60 mb-2" dir="rtl">
                نموذج Gemma 2 يعمل محليًا عبر WebGPU — لا يحتاج اتصال بالإنترنت
              </p>
              <p className="text-[10px] text-[var(--ide-text-dim)]">
                Gemma 2 runs locally via WebGPU — no internet connection needed
              </p>
            </div>
          </div>
        </div>

        {/* AI Models Section */}
        <div className="w-full mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ide-text-dim)] mb-3">
            AI Models — نماذج الذكاء الاصطناعي
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Sovereign Track */}
            <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <div className="flex items-center gap-2 mb-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-[var(--ide-text)]">
                  {UI_LABELS.sovereignTrack.en}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium ml-auto">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-[var(--ide-text-muted)]">Gemma 2 (INT4 Quantized)</p>
              <p className="text-[9px] text-teal-300/60" dir="rtl">يعمل محليًا عبر WebGPU في المتصفح</p>
            </div>

            {/* Reasoning Track */}
            <div className="p-3 rounded-lg border border-sky-500/20 bg-sky-500/5">
              <div className="flex items-center gap-2 mb-1.5">
                <Cloud className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-xs font-medium text-[var(--ide-text)]">
                  {UI_LABELS.reasoningTrack.en}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium ml-auto">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-[var(--ide-text-muted)]">Gemini 3.1 Flash Lite (Free)</p>
              <p className="text-[9px] text-teal-300/60" dir="rtl">إعادة صياغة سحابية عبر Gemini API</p>
            </div>

            {/* Gemma 4 Coming Soon */}
            <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 col-span-1 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Rocket className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-medium text-amber-400">
                  Gemma 4 — قريبًا (Coming Soon)
                </span>
              </div>
              <p className="text-[10px] text-[var(--ide-text-dim)] mt-1">
                WebLLM v0.2.82 does not yet support Gemma 4. Once available, we will
                upgrade the Sovereign Track for significantly better translation quality.
              </p>
            </div>
          </div>
        </div>

        {/* Phase Roadmap */}
        <div className="w-full space-y-2.5 mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ide-text-dim)]">
            Development Roadmap — خارطة التطوير
          </h3>

          {[
            {
              phase: 1,
              title: "PWA Scaffold & WebGPU Telemetry",
              arTitle: "هيكل PWA وكشف إمكانيات GPU",
              status: "completed" as const,
              description: "Workspace shell, GPU detection, PWA manifest",
            },
            {
              phase: 2,
              title: "Monaco Editor & Event Loop",
              arTitle: "محرر Monaco وحلقة الأحداث",
              status: "completed" as const,
              description: "IDE editor, debounced keystrokes, abort logic, ghost text",
            },
            {
              phase: 3,
              title: "Client-Side Vector DB & RAG",
              arTitle: "قاعدة بيانات المتجهات وجلب السياق",
              status: "completed" as const,
              description: "Orama vector DB, Transformers.js embeddings, Web Worker",
            },
            {
              phase: 4,
              title: "Local Sovereign Track (Gemma 2B)",
              arTitle: "المسار السيادي المحلي (Gemma 2B)",
              status: "completed" as const,
              description: "WebLLM inference, ghost text, interrupt on keystroke",
            },
            {
              phase: 5,
              title: "Cloud Reasoning Track & Linting",
              arTitle: "مسار الاستدلال السحابي والفحص",
              status: "completed" as const,
              description: "Gemini API, AMTA linter, rewrite panel, BYOK settings",
            },
            {
              phase: 6,
              title: "Polish, Static Export & CI/CD",
              arTitle: "التحسين والتصدير والنشر",
              status: "completed" as const,
              description: "Static HTML export, GitHub Pages deploy, comprehensive docs",
            },
            {
              phase: 7,
              title: "Professional UI & Vercel Deployment",
              arTitle: "واجهة احترافية — Vercel Deployment",
              status: "active" as const,
              description: "Bilingual Arabic/English labels, Vercel deployment, polish",
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
                <div className="flex items-center gap-2 flex-wrap">
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
                <p className="text-[10px] text-teal-300/60 mt-0.5" dir="rtl">
                  {item.arTitle}
                </p>
                <p className="text-xs text-[var(--ide-text-dim)] mt-0.5">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center gap-2 text-xs text-[var(--ide-text-dim)]">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Open the</span>
            <span className="text-teal-400 font-medium">
              {UI_LABELS.translationEditor.en}
            </span>
            <span>tab to see Monaco + ghost text in action</span>
          </div>
        </div>

        {/* Footer — Developer Credit */}
        <div className="w-full pt-4 mt-2 border-t border-[var(--ide-border)] text-center">
          <p className="text-[11px] text-[var(--ide-text-dim)] mb-1" dir="rtl">
            تطوير: د. وليد مندور — جامعة السلطان قابوس
          </p>
          <p className="text-[10px] text-[var(--ide-text-dim)]">
            Development: Dr. Waleed Mandour — Sultan Qaboos University
          </p>
        </div>
      </div>
    </div>
  );
}
