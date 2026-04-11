"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { useSettingsStore } from "@/stores/settings-store";
import { useRAG } from "@/hooks/useRAG";
import {
  Cpu,
  Zap,
  Cloud,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Wifi,
  WifiOff,
} from "lucide-react";

interface EngineCard {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: React.ElementType;
  color: string;
  isActive: boolean;
  statusText: string;
  statusTextAr: string;
}

export function AiModelsView() {
  const { locale } = useLanguage();
  const isRTL = locale === "ar";
  const { state: ragState } = useRAG();
  const geminiKey = useSettingsStore((s) => s.geminiApiKey);
  const useCloud = useSettingsStore((s) => s.useCloudFallback);

  // Determine engine statuses
  const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;

  const engines: EngineCard[] = [
    {
      id: "lte",
      name: "Local Translation Engine (LTE)",
      nameAr: "محرك الترجمة المحلي",
      description:
        "Channel 0 — Instant phrase matching with Smart Remainder completion. Works 100% offline with zero latency (<5ms). Uses a curated corpus of bilingual sentence pairs.",
      descriptionAr:
        "القناة 0 — مطابقة فورية للعبارات مع إكمال الذكي. يعمل بدون إنترنت بنسبة 100% وزمن استجابة أقل من 5 مللي ثانية.",
      icon: Zap,
      color: "text-primary",
      isActive: true,
      statusText: "Always Active",
      statusTextAr: "نشط دائماً",
    },
    {
      id: "rag",
      name: "RAG Vector Database",
      nameAr: "قاعدة بيانات المتجهات",
      description:
        "Semantic search using BGE-M3 embeddings and Orama vector DB. Provides contextually relevant translations from your corpus. Loads in background.",
      descriptionAr:
        "بحث دلالي باستخدام تضمينات BGE-M3 وقاعدة بيانات Orama. يوفر ترجمات ذات صلة سياقية من نصوصك.",
      icon: Cpu,
      color: "text-blue-400",
      isActive: ragState.isCorpusLoaded,
      statusText: ragState.isCorpusLoaded ? `${ragState.corpusSize} segments loaded` : "Loading...",
      statusTextAr: ragState.isCorpusLoaded ? `تم تحميل ${ragState.corpusSize} مقطع` : "جاري التحميل...",
    },
    {
      id: "webllm",
      name: "WebLLM (WebGPU)",
      nameAr: "WebLLM (WebGPU)",
      description:
        "Channel 1 — Neural machine translation running directly in your browser via WebGPU. Model: Gemma 2B (quantized). No data leaves your machine. ~1.5GB one-time download.",
      descriptionAr:
        "القناة 1 — ترجمة آلية عصبية تعمل مباشرة في متصفحك عبر WebGPU. النموذج: Gemma 2B. لا تغادر البيانات جهازك.",
      icon: hasWebGPU ? Wifi : WifiOff,
      color: hasWebGPU ? "text-emerald-400" : "text-warning",
      isActive: hasWebGPU,
      statusText: hasWebGPU ? "WebGPU Available — Ready to download" : "WebGPU Not Available",
      statusTextAr: hasWebGPU ? "WebGPU متاح — جاهز للتنزيل" : "WebGPU غير متاح",
    },
    {
      id: "gemini",
      name: "Google Gemini Cloud",
      nameAr: "Google Gemini السحابي",
      description:
        "Channel 2 — Cloud fallback when WebGPU is unavailable. Requires an API key from Google AI Studio. Uses Gemini 2.0 Flash for fast, high-quality translations.",
      descriptionAr:
        "القناة 2 — احتساب سحابي عند عدم توفر WebGPU. يتطلب مفتاح API من Google AI Studio.",
      icon: Cloud,
      color: geminiKey && useCloud ? "text-purple-400" : "text-muted-foreground",
      isActive: Boolean(geminiKey) && useCloud,
      statusText: geminiKey && useCloud ? "Active — API Key configured" : "Inactive — Configure in Settings",
      statusTextAr: geminiKey && useCloud ? "نشط — مفتاح API مضبوط" : "غير نشط — قم بالإعداد في الإعدادات",
    },
  ];

  return (
    <div
      className={cn(
        "h-full overflow-y-auto bg-background p-6",
        isRTL ? "text-right" : "text-left"
      )}
      dir={isRTL ? "rtl" : undefined}
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isRTL ? "نماذج الذكاء الاصطناعي" : "AI Models"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRTL
              ? "إدارة محركات الترجمة وتكوينها"
              : "Manage and configure translation engines"}
          </p>
        </div>

        <div className="space-y-4">
          {engines.map((engine) => {
            const Icon = engine.icon;
            return (
              <div
                key={engine.id}
                className={cn(
                  "bg-surface border rounded-xl p-5 transition-colors",
                  engine.isActive
                    ? "border-border/70"
                    : "border-border/30 opacity-75"
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                      engine.isActive
                        ? "bg-primary-muted/20"
                        : "bg-surface-hover/50"
                    )}
                  >
                    <Icon className={cn("w-6 h-6", engine.color)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-semibold text-foreground truncate">
                        {isRTL ? engine.nameAr : engine.name}
                      </h2>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {engine.isActive ? (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        ) : engine.id === "gemini" ? (
                          <AlertCircle className="w-4 h-4 text-warning" />
                        ) : (
                          <XCircle className="w-4 h-4 text-error" />
                        )}
                        <span
                          className={cn(
                            "text-[10px] font-semibold",
                            engine.isActive ? "text-primary" : "text-muted-foreground"
                          )}
                        >
                          {isRTL ? engine.statusTextAr : engine.statusText}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      {isRTL ? engine.descriptionAr : engine.description}
                    </p>

                    {/* Channel badge */}
                    <div className="mt-3 flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded",
                          engine.id === "lte"
                            ? "bg-primary/15 text-primary"
                            : engine.id === "rag"
                              ? "bg-blue-900/30 text-blue-400"
                              : engine.id === "webllm"
                                ? "bg-emerald-900/30 text-emerald-400"
                                : "bg-purple-900/30 text-purple-400"
                        )}
                      >
                        {engine.id === "lte"
                          ? "Channel 0"
                          : engine.id === "rag"
                            ? "RAG"
                            : engine.id === "webllm"
                              ? "Channel 1"
                              : "Channel 2"}
                      </span>
                      {engine.id === "lte" && (
                        <span className="text-[10px] text-muted-foreground/50">
                          {isRTL ? "دائماً متاح · بدون إنترنت" : "Always available · Offline"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
