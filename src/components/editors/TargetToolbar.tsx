"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { Copy, Download, Eraser, AlignRight, FileText, CheckCircle, GraduationCap } from "lucide-react";

interface TargetToolbarProps {
  targetText: string;
  onClear: () => void;
  onExplain?: () => void;
  onQA?: () => void;
}

export function TargetToolbar({ targetText, onClear, onExplain, onQA }: TargetToolbarProps) {
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
        onClick={onQA}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
          "text-muted-foreground hover:text-primary hover:bg-surface-hover"
        )}
        title={isRTL ? "فحص الجودة (QA)" : "QA Check"}
      >
        <CheckCircle className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {isRTL ? "فحص الجودة" : "QA Check"}
        </span>
      </button>

      <button
        onClick={onExplain}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
          "text-muted-foreground hover:text-emerald-500 hover:bg-surface-hover"
        )}
        title={isRTL ? "اشرح هذه الترجمة (AI Tutor)" : "Explain this Translation (AI Tutor)"}
      >
        <GraduationCap className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {isRTL ? "المعلم الذكي" : "AI Tutor"}
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

      <button
        onClick={() => {
          // Export as TMX
          const header = `<?xml version="1.0" encoding="UTF-8"?>\n<tmx version="1.4"><header creationtool="RDAT" srclang="en-US" adminlang="en-US" datatype="plaintext" segtype="sentence" /><body>`;
          const footer = `</body></tmx>`;
          const sourceLines = (window as any).__lastSourceLines || [];
          const targetLines = targetText.split("\n");
          let body = "";
          for (let i = 0; i < Math.min(sourceLines.length, targetLines.length); i++) {
            if (sourceLines[i].trim() && targetLines[i].trim()) {
              body += `<tu><tuv xml:lang="en-US"><seg>${sourceLines[i].replace(/</g,"&lt;")}</seg></tuv><tuv xml:lang="ar-SA"><seg>${targetLines[i].replace(/</g,"&lt;")}</seg></tuv></tu>\n`;
            }
          }
          const blob = new Blob([header + body + footer], { type: "application/xml;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `memory-${Date.now()}.tmx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }}
        disabled={!targetText.trim()}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
          targetText.trim()
            ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
            : "text-muted-foreground/30 cursor-not-allowed"
        )}
        title={isRTL ? "تصدير كـ TMX" : "Export as TMX"}
      >
        <FileText className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {isRTL ? "تصدير TMX" : "Export TMX"}
        </span>
      </button>

      <button
        onClick={() => {
          // Quick export to doc file retaining basic structure
          const html = `<html><head><meta charset="utf-8"><style>body{direction: rtl; font-family: 'Arial'; font-size: 14pt;}</style></head><body>${targetText.split('\n').map(p => `<p>${p}</p>`).join('')}</body></html>`;
          const blob = new Blob([html], { type: "application/vnd.ms-word;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `translation-${Date.now()}.doc`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }}
        disabled={!targetText.trim()}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
          targetText.trim()
            ? "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
            : "text-muted-foreground/30 cursor-not-allowed"
        )}
        title={isRTL ? "تصدير Word" : "Export Word"}
      >
        <FileText className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {isRTL ? "تصدير Word" : "Export Word"}
        </span>
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
