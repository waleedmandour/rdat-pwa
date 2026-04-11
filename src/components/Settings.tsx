"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import { useLanguage } from "@/context/LanguageContext";
import {
  KeyRound,
  ExternalLink,
  Check,
  X,
  Eye,
  EyeOff,
  Cloud,
  Cpu,
  Sliders,
} from "lucide-react";

export function SettingsPanel() {
  const { locale } = useLanguage();
  const isRTL = locale === "ar";

  // Settings
  const geminiApiKey = useSettingsStore((s) => s.geminiApiKey);
  const setGeminiApiKey = useSettingsStore((s) => s.setGeminiApiKey);
  const useCloud = useSettingsStore((s) => s.useCloudFallback);
  const setUseCloud = useSettingsStore((s) => s.setUseCloudFallback);
  const temperature = useSettingsStore((s) => s.temperature);
  const setTemperature = useSettingsStore((s) => s.setTemperature);

  // Local state
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState(geminiApiKey);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setGeminiApiKey(keyInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setKeyInput("");
    setGeminiApiKey("");
  };

  return (
    <div
      className={cn(
        "h-full overflow-y-auto bg-background p-6",
        isRTL ? "text-right" : "text-left"
      )}
      dir={isRTL ? "rtl" : undefined}
    >
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isRTL ? "الإعدادات" : "Settings"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRTL
              ? "إدارة مفاتيح API وتفضيلات الذكاء الاصطناعي"
              : "Manage API keys and AI preferences"}
          </p>
        </div>

        {/* Gemini API Key */}
        <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Google Gemini API
            </h2>
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded",
                useCloud && keyInput.trim()
                  ? "bg-primary/20 text-primary"
                  : "bg-warning/10 text-warning"
              )}
            >
              {useCloud && keyInput.trim()
                ? isRTL
                  ? "نشط"
                  : "Active"
                : isRTL
                  ? "غير مفعّل"
                  : "Inactive"}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {isRTL ? (
              <>
                أدخل مفتاح API من Google AI Studio للاستخدام كاحتساب سحابي.{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline inline-flex items-center gap-1"
                >
                  الحصول على مفتاح
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            ) : (
              <>
                Enter your API key from Google AI Studio for cloud fallback.{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline inline-flex items-center gap-1"
                >
                  Get a key
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
          </p>

          {/* Key Input */}
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className={cn(
                "w-full bg-background border border-border rounded-lg px-4 py-2.5 pr-20",
                "text-sm text-foreground placeholder:text-muted-foreground/40",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                onClick={() => setShowKey((v) => !v)}
                className="p-1.5 rounded hover:bg-surface-hover text-muted-foreground"
                title={showKey ? "Hide" : "Show"}
              >
                {showKey ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
              {keyInput && (
                <button
                  onClick={handleReset}
                  className="p-1.5 rounded hover:bg-surface-hover text-muted-foreground"
                  title="Clear"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!keyInput.trim()}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                keyInput.trim()
                  ? "bg-primary text-background hover:bg-primary-hover"
                  : "bg-surface-hover text-muted-foreground cursor-not-allowed"
              )}
            >
              <span className="flex items-center gap-1.5">
                {saved ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {isRTL ? "تم الحفظ" : "Saved"}
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    {isRTL ? "حفظ المفتاح" : "Save Key"}
                  </>
                )}
              </span>
            </button>
          </div>

          {/* Cloud Fallback Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">
                {isRTL
                  ? "استخدام الاحتساب السحابي عند عدم توفر WebGPU"
                  : "Use cloud fallback when WebGPU unavailable"}
              </span>
            </div>
            <button
              onClick={() => setUseCloud(!useCloud)}
              className={cn(
                "relative w-10 h-5 rounded-full transition-colors",
                useCloud ? "bg-primary" : "bg-surface-hover"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-background transition-all",
                  useCloud
                    ? isRTL
                      ? "right-0.5"
                      : "left-0.5"
                    : isRTL
                      ? "right-5"
                      : "left-0.5"
                )}
              />
            </button>
          </div>
        </section>

        {/* Model Parameters */}
        <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              {isRTL ? "معلمات النموذج" : "Model Parameters"}
            </h2>
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground">
                {isRTL ? "درجة الحرارة" : "Temperature"}
              </label>
              <span className="text-xs text-muted-foreground font-mono">
                {temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/50">
              <span>{isRTL ? "دقيق" : "Precise"}</span>
              <span>{isRTL ? "إبداعي" : "Creative"}</span>
            </div>
          </div>
        </section>

        {/* Info */}
        <section className="bg-surface/50 border border-border/50 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            {isRTL ? "معلومات المحرك" : "Engine Information"}
          </h2>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>{isRTL ? "القناة 0: محلي" : "Channel 0: LTE"}</span>
              <span className="text-primary">✓ {isRTL ? "دائماً نشط" : "Always active"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{isRTL ? "القناة 1: WebGPU" : "Channel 1: WebLLM"}</span>
              <span className="text-blue-400">
                {isRTL ? "يحتاج WebGPU" : "Requires WebGPU"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{isRTL ? "القناة 2: Gemini" : "Channel 2: Gemini"}</span>
              <span className={useCloud ? "text-primary" : "text-warning"}>
                {geminiApiKey ? isRTL ? "نشط" : "Active" : isRTL ? "يحتاج مفتاح" : "Needs key"}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
