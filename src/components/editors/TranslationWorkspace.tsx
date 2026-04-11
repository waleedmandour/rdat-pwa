"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import type { editor } from "monaco-editor";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { useRAG } from "@/hooks/useRAG";
import { usePredictiveTranslation } from "@/hooks/usePredictiveTranslation";
import { usePrefetchStore } from "@/stores/prefetch-store";
import { SourceEditor } from "./SourceEditor";
import { TargetEditor } from "./TargetEditor";
import { SegmentHighlighter } from "./SegmentHighlighter";
import { SourceToolbar } from "./SourceToolbar";
import { TargetToolbar } from "./TargetToolbar";

// Sample default content for demonstration
const DEFAULT_SOURCE = `The future of translation technology lies in the seamless integration of artificial intelligence with human expertise. Computer-assisted translation tools have evolved significantly, moving from simple terminology management to sophisticated neural machine translation systems.

Modern translators work in hybrid environments where AI provides initial suggestions and human linguists refine the output. This collaborative approach ensures both efficiency and quality, particularly for specialized domains like legal, medical, and technical translation.

The key challenge in machine translation remains context preservation. Unlike human translators who understand cultural nuances and idiomatic expressions, AI systems rely on statistical patterns and training data. The best results come from combining both strengths.

Quality assurance in translation involves multiple layers: terminology consistency, grammatical correctness, cultural appropriateness, and domain accuracy. Professional translators use glossaries, translation memories, and style guides to maintain standards across large projects.

The emergence of real-time collaboration features has transformed how translation teams work together. Cloud-based platforms allow multiple linguists to work on the same project simultaneously, with version control and automated quality checks ensuring consistency throughout the process.`;

const DEFAULT_TARGET = `يكمن مستقبل تكنولوجيا الترجمة في التكامل السلس بين الذكاء الاصطناعي والخبرة البشرية. فقد تطورت أدوات الترجمة بمساعدة الحاسوب بشكل ملحوظ، منتقلة من إدارة المصطلحات البسيطة إلى أنظمة الترجمة الآلية العصبية المتطورة.

يعمل المترجمون الحديثون في بيئات هجينة حيث يقدم الذكاء الاصطناعي اقتراحات أولية ويقوم اللغويون البشر بتحسين المخرجات. يضمن هذا النهج التعاوني الكفاءة والجودة معاً، لا سيما في المجالات المتخصصة مثل الترجمة القانونية والطبية والتقنية.

يظل الحفاظ على السياق التحدي الرئيسي في الترجمة الآلية. فعلى عكس المترجمين البشر الذين يفهمون الفروق الثقافية والتعبيرات الاصطلاحية، تعتمد أنظمة الذكاء الاصطناعي على الأنماط الإحصائية وبيانات التدريب. وتتأتي أفضل النتائج من الجمع بين نقاط القوة في كلا النهجين.

تشمل ضمان الجودة في الترجمة طبقات متعددة: اتساق المصطلحات، والصحة النحوية، والملاءمة الثقافية، والدقة المتخصصة. ويستخدم المترجمون المحترفون المسارد وقواعد الترجمة وأدلة الأسلوب للحفاظ على المعايير عبر المشاريع الكبيرة.

غيّر ظهور ميزات التعاون في الوقت الفعلي طريقة عمل فرق الترجمة معاً. تتيح المنصات السحابية لعدة لغويين العمل على نفس المشروع في وقت واحد، مع التحكم في الإصدار وفحوصات الجودة الآلية التي تضمن الاتساق طوال العملية.`;

interface TranslationWorkspaceProps {
  sourceContent?: string;
  targetContent?: string;
  onSourceChange?: (value: string | undefined) => void;
  onTargetChange?: (value: string | undefined) => void;
  onWebgpuStateChange?: (state: import("@/components/StatusBar").WebGPUInfo) => void;
  onGeminiAvailableChange?: (available: boolean) => void;
}

export function TranslationWorkspace({
  sourceContent,
  targetContent,
  onSourceChange,
  onTargetChange,
  onWebgpuStateChange,
  onGeminiAvailableChange,
}: TranslationWorkspaceProps) {
  const { locale } = useLanguage();
  const { state: ragState, lteSuggest, search } = useRAG();
  usePredictiveTranslation(); // Activates idle prefetch engine
  const setSourceLines = usePrefetchStore((s) => s.setSourceLines);
  const setActiveLine = usePrefetchStore((s) => s.setActiveLine);

  // Editor state
  const [sourceValue, setSourceValue] = useState(sourceContent ?? DEFAULT_SOURCE);
  const [targetValue, setTargetValue] = useState(targetContent ?? DEFAULT_TARGET);

  // Sync state — which line is active in each pane
  const [targetLine, setTargetLine] = useState<number | null>(null);
  const [sourceLine, setSourceLine] = useState<number | null>(null);

  // Memoized source lines array for ghost text + prefetch
  const sourceLinesArr = useMemo(() => sourceValue.split("\n"), [sourceValue]);

  // Keep prefetch store updated with source lines
  useEffect(() => {
    setSourceLines(sourceLinesArr);
  }, [sourceLinesArr, setSourceLines]);

  // Editor refs for cross-pane highlighting
  const sourceEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const targetEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // Register editor refs on mount via a small hack
  // We intercept the onMount through a wrapper
  const handleSourceMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    sourceEditorRef.current = editor;
  }, []);

  const handleTargetMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    targetEditorRef.current = editor;
  }, []);

  // Handle cursor change from Target editor
  const handleTargetCursorChange = useCallback((lineNumber: number) => {
    setTargetLine(lineNumber);
    // Bidirectional sync: source line = target line (1:1 alignment)
    setSourceLine(lineNumber);
    // Notify prefetch store of active line (triggers idle prefetch)
    setActiveLine(lineNumber);
  }, [setActiveLine]);

  // Handle source content changes
  const handleSourceChange = useCallback(
    (value: string | undefined) => {
      setSourceValue(value ?? "");
      onSourceChange?.(value);
    },
    [onSourceChange]
  );

  // Handle target content changes
  const handleTargetChange = useCallback(
    (value: string | undefined) => {
      setTargetValue(value ?? "");
      onTargetChange?.(value);
    },
    [onTargetChange]
  );

  // Clear both panes
  const handleClear = useCallback(() => {
    setSourceValue("");
    setTargetValue("");
  }, []);

  // Calculate line counts for status bar
  const sourceLineCount = sourceValue.split("\n").filter((l) => l.trim()).length;
  const targetLineCount = targetValue.split("\n").filter((l) => l.trim()).length;
  const wordCount = sourceValue.split(/\s+/).filter((w) => w).length;

  return (
    <div
      className={cn("flex flex-col h-full w-full overflow-hidden bg-background")}
      dir={locale === "ar" ? "rtl" : undefined}
    >
      {/* Split Pane Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-surface border-b border-border text-xs">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {locale === "ar" ? "المصدر" : "Source"}
          </span>
          <span className="text-[10px] text-muted-foreground/50 bg-background/50 px-1.5 py-0.5 rounded">
            EN · {sourceLineCount} {locale === "ar" ? "أسطر" : "lines"} · {wordCount}{" "}
            {locale === "ar" ? "كلمة" : "words"}
          </span>
        </div>

        {/* Engine Status */}
        <div className="flex items-center gap-2">
          {ragState.isLoading && (
            <span className="text-[10px] text-blue-400 animate-pulse">
              {locale === "ar" ? "جاري تحميل المحرك…" : "Loading engine…"}
            </span>
          )}
          {ragState.isCorpusLoaded && (
            <span className="text-[10px] text-primary/70">
              ✓ {ragState.corpusSize} {locale === "ar" ? "مقطع" : "segments"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {locale === "ar" ? "الهدف" : "Target"}
          </span>
          <span className="text-[10px] text-muted-foreground/50 bg-background/50 px-1.5 py-0.5 rounded">
            AR · {targetLineCount} {locale === "ar" ? "أسطر" : "lines"}
          </span>
        </div>
      </div>

      {/* Split Pane Editors with Toolbars */}
      <div className="flex-1 flex overflow-hidden">
        {/* Source Pane (English, LTR, Read-Only) */}
        <div
          className={cn(
            "flex-1 border-r border-border overflow-hidden flex flex-col",
            locale === "ar" ? "border-r-0 border-l" : ""
          )}
        >
          <SourceToolbar sourceText={sourceValue} onTextChange={(t) => setSourceValue(t)} />
          <div className="flex-1" style={{ minHeight: 0 }}>
            <SourceEditor
              value={sourceValue}
              onChange={handleSourceChange}
              highlightedLine={targetLine}
              className="h-full"
            />
          </div>
        </div>

        {/* Target Pane (Arabic, RTL, Editable) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <TargetToolbar targetText={targetValue} onClear={handleClear} />
          <div className="flex-1" style={{ minHeight: 0 }}>
            <TargetEditor
              value={targetValue}
              onChange={handleTargetChange}
              onCursorChange={handleTargetCursorChange}
              sourceLines={sourceLinesArr}
              onWebgpuStateChange={onWebgpuStateChange}
              onGeminiAvailableChange={onGeminiAvailableChange}
              className="h-full"
            />
          </div>
        </div>
      </div>

      {/* Segment Highlighter — invisible sync logic */}
      <SegmentHighlighter
        sourceLineNumber={sourceLine}
        targetLineNumber={targetLine}
        sourceEditorRef={sourceEditorRef as any}
        targetEditorRef={targetEditorRef as any}
      />

      {/* CSS for sync highlights */}
      <style jsx global>{`
        .sync-highlight-source {
          background-color: rgba(2, 132, 199, 0.1) !important;
        }
        .sync-highlight-source-inline {
          background-color: rgba(2, 132, 199, 0.1) !important;
        }
        .sync-highlight-target {
          background-color: rgba(217, 119, 6, 0.08) !important;
        }
        .sync-highlight-target-inline {
          background-color: rgba(217, 119, 6, 0.08) !important;
        }
        .sync-glyph-source::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: rgba(2, 132, 199, 0.5);
          border-radius: 0 2px 2px 0;
        }
        .sync-glyph-target::before {
          content: "";
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: rgba(217, 119, 6, 0.4);
          border-radius: 2px 0 0 2px;
        }
      `}</style>
    </div>
  );
}
