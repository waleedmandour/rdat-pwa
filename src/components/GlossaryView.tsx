"use client";

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { useRAG } from "@/hooks/useRAG";
import { getLTE } from "@/lib/local-translation-engine";
import {
  Upload,
  FileJson,
  Database,
  Search,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface GlossaryEntry {
  en: string;
  ar: string;
  type: string;
}

export function GlossaryView() {
  const { locale } = useLanguage();
  const isRTL = locale === "ar";
  const { state: ragState, lteSearch } = useRAG();
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");

  // Get corpus stats from LTE
  const stats = getLTE().getStats();
  const entries = lteSearch(searchTerm || " ", 100);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data: GlossaryEntry[] = JSON.parse(text);

        if (!Array.isArray(data) || !data[0]?.en || !data[0]?.ar) {
          throw new Error("Invalid corpus format");
        }

        // Load into LTE
        getLTE().load(data);
        setUploadStatus("success");
        setTimeout(() => setUploadStatus("idle"), 3000);
      } catch (err) {
        console.error("[Glossary] Upload failed:", err);
        setUploadStatus("error");
        setTimeout(() => setUploadStatus("idle"), 3000);
      }

      // Reset file input
      e.target.value = "";
    },
    []
  );

  return (
    <div
      className={cn(
        "h-full overflow-y-auto bg-background p-6",
        isRTL ? "text-right" : "text-left"
      )}
      dir={isRTL ? "rtl" : undefined}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isRTL ? "مسرد GTR وقاعدة البيانات" : "GTR Glossary & Vector DB"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isRTL
                ? `${stats.entries} مقطع متاح · ${stats.indexedKeys} مفتهرس`
                : `${stats.entries} segments available · ${stats.indexedKeys} indexed`}
            </p>
          </div>

          {/* Upload Button */}
          <div className="flex items-center gap-3">
            {uploadStatus === "success" && (
              <span className="flex items-center gap-1 text-xs text-primary">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isRTL ? "تم التحميل" : "Uploaded"}
              </span>
            )}
            {uploadStatus === "error" && (
              <span className="flex items-center gap-1 text-xs text-error">
                <XCircle className="w-3.5 h-3.5" />
                {isRTL ? "فشل التحميل" : "Upload failed"}
              </span>
            )}
            <label
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors",
                "bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25"
              )}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isRTL ? "تحميل Corpus" : "Upload Corpus"}</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isRTL ? "ابحث في المسرد..." : "Search glossary..."}
            className={cn(
              "w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2.5",
              "text-sm text-foreground placeholder:text-muted-foreground/40",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            )}
          />
        </div>

        {/* Format hint */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface/50 border border-border/30 text-[11px] text-muted-foreground">
          <FileJson className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            {isRTL
              ? "تنسيق الملف: [{ \"en\": \"English\", \"ar\": \"العربية\", \"type\": \"tm\" }]"
              : "Expected format: [{ \"en\": \"English text\", \"ar\": \"Arabic text\", \"type\": \"tm\" }]"}
          </span>
        </div>

        {/* Glossary Table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/30">
                <th
                  className={cn(
                    "px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider",
                    isRTL ? "text-right" : "text-left"
                  )}
                >
                  {isRTL ? "الإنجليزية" : "English"}
                </th>
                <th className="px-3 py-3 text-xs text-muted-foreground">
                  <ArrowRight className="w-4 h-4" />
                </th>
                <th
                  className={cn(
                    "px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider",
                    isRTL ? "text-right" : "text-left"
                  )}
                >
                  {isRTL ? "العربية" : "Arabic"}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">
                      {isRTL
                        ? "لا توجد نتائج. قم بتحميل ملف corpus JSON للبدء."
                        : "No entries found. Upload a corpus JSON file to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                entries.slice(0, 50).map((entry, i) => (
                  <tr
                    key={i}
                    className={cn(
                      "border-b border-border/50 last:border-0 transition-colors hover:bg-surface-hover/20"
                    )}
                  >
                    <td
                      className={cn(
                        "px-5 py-3 text-foreground text-xs",
                        isRTL ? "text-right" : "text-left",
                        "font-mono"
                      )}
                    >
                      {entry.en.length > 100
                        ? entry.en.substring(0, 100) + "..."
                        : entry.en}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground/30">
                      <ArrowRight
                        className={cn(
                          "w-3.5 h-3.5",
                          isRTL ? "rotate-180" : ""
                        )}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-5 py-3 text-xs",
                        isRTL ? "text-right" : "text-left"
                      )}
                    >
                      {entry.ar.length > 100
                        ? entry.ar.substring(0, 100) + "..."
                        : entry.ar}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {entries.length > 50 && (
            <div className="px-5 py-3 text-[10px] text-muted-foreground/50 border-t border-border/30 text-center">
              {isRTL
                ? `عرض 50 من ${entries.length} نتيجة`
                : `Showing 50 of ${entries.length} results`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
