"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { Copy, Download, Eraser, AlignRight } from "lucide-react";

interface TargetToolbarProps {
  targetText: string;
  onClear: () => void;
}

export function TargetToolbar({ targetText, onClear }: TargetToolbarProps) {
  const { locale } = useLanguage();
  const isRTL = locale === "ar";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetText);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = targetText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const handleExport = () => {
    const blob = new Blob([targetText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `translation-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    const msg = isRTL
      ? "هل أنت متأكد من مسح كلا اللوحتين؟"
      : "Are you sure you want to clear both panes?";
    if (window.confirm(msg)) {
      onClear();
    }
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-surface border-b border-border">
      <button
        onClick={handleCopy}
        disabled={!targetText.trim()}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
          targetText.trim()
            ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
            : "text-muted-foreground/30 cursor-not-allowed"
        )}
        title={isRTL ? "نسخ الترجمة" : "Copy translation"}
      >
        <Copy className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {isRTL ? "نسخ الترجمة" : "Copy Translation"}
        </span>
      </button>

      <div className="w-px h-4 bg-border/50 mx-1" />

      <button
        onClick={handleExport}
        disabled={!targetText.trim()}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
          targetText.trim()
            ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
            : "text-muted-foreground/30 cursor-not-allowed"
        )}
        title={isRTL ? "تصدير كملف TXT" : "Export as TXT"}
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {isRTL ? "تصدير TXT" : "Export TXT"}
        </span>
      </button>

      <div className="w-px h-4 bg-border/50 mx-1" />

      <button
        onClick={handleClear}
        disabled={!targetText.trim()}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
          targetText.trim()
            ? "text-muted-foreground hover:text-error hover:bg-error-bg/50"
            : "text-muted-foreground/30 cursor-not-allowed"
        )}
        title={isRTL ? "مسح الكل" : "Clear all"}
      >
        <Eraser className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{isRTL ? "مسح" : "Clear"}</span>
      </button>

      <div className="flex-1" />

      {/* Target indicator */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
        <AlignRight className="w-3 h-3" />
        <span>AR</span>
      </div>
    </div>
  );
}
