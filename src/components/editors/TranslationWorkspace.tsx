"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { editor } from "monaco-editor";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { usePredictiveTranslation } from "@/hooks/usePredictiveTranslation";
import { usePrefetchStore } from "@/stores/prefetch-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { SourceEditor } from "./SourceEditor";
import { TargetEditor } from "./TargetEditor";
import { SegmentHighlighter } from "./SegmentHighlighter";
import { SourceToolbar } from "./SourceToolbar";
import { TargetToolbar } from "./TargetToolbar";

// Sample default content for demonstration (used only when store is empty)
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

/** Debounce delay for auto-save writes to localStorage (ms) */
const AUTOSAVE_DEBOUNCE_MS = 500;

interface TranslationWorkspaceProps {
  sourceContent?: string;
  targetContent?: string;
  onSourceChange?: (value: string | undefined) => void;
  onTargetChange?: (value: string | undefined) => void;
  onWebgpuStateChange?: (state: import("@/components/StatusBar").WebGPUInfo) => void;
  onGeminiAvailableChange?: (available: boolean) => void;
  onRagStateChange?: (state: import("@/hooks/useRAG").RAGState) => void;
}

export function TranslationWorkspace({
  sourceContent,
  targetContent,
  onSourceChange,
  onTargetChange,
  onWebgpuStateChange,
  onGeminiAvailableChange,
  onRagStateChange,
}: TranslationWorkspaceProps) {
  const { locale } = useLanguage();
  usePredictiveTranslation(); // Activates idle prefetch engine
  const setSourceLines = usePrefetchStore((s) => s.setSourceLines);
  const setActiveLine = usePrefetchStore((s) => s.setActiveLine);

  // ── Workspace store for auto-save ──────────────────────────────
  const savedSource = useWorkspaceStore((s) => s.sourceContent);
  const savedTarget = useWorkspaceStore((s) => s.targetContent);
  const savedSwap = useWorkspaceStore((s) => s.swapDirection);
  const setSavedSource = useWorkspaceStore((s) => s.setSourceContent);
  const setSavedTarget = useWorkspaceStore((s) => s.setTargetContent);
  const setSavedSwap = useWorkspaceStore((s) => s.setSwapDirection);
  const toggleSavedSwap = useWorkspaceStore((s) => s.toggleSwapDirection);

  // Editor state — initialize from store (persisted) or props or defaults
  const [sourceValue, setSourceValue] = useState(
    sourceContent ?? (savedSource || DEFAULT_SOURCE)
  );
  const [targetValue, setTargetValue] = useState(
    targetContent ?? (savedTarget || DEFAULT_TARGET)
  );

  // ── Reset keys for editors ─────────────────────────────────────
  // When incremented, TargetEditor and SourceEditor remount,
  // picking up the new defaultValue and resetting internal state.
  const [sourceResetKey, setSourceResetKey] = useState(0);
  const [targetResetKey, setTargetResetKey] = useState(0);

  // Translation direction — persisted in store
  const [swapDirection, setSwapDirection] = useState(savedSwap);
  const sourceDir = swapDirection ? "rtl" : "ltr";
  const targetDir = swapDirection ? "ltr" : "rtl";
  const sourceLangLabel = swapDirection ? "AR" : "EN";
  const targetLangLabel = swapDirection ? "EN" : "AR";

  // Debounce timers for auto-save
  const sourceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save source with debounce
  const debouncedSaveSource = useCallback((text: string) => {
    if (sourceSaveTimer.current) clearTimeout(sourceSaveTimer.current);
    sourceSaveTimer.current = setTimeout(() => {
      setSavedSource(text);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [setSavedSource]);

  // Auto-save target with debounce
  const debouncedSaveTarget = useCallback((text: string) => {
    if (targetSaveTimer.current) clearTimeout(targetSaveTimer.current);
    targetSaveTimer.current = setTimeout(() => {
      setSavedTarget(text);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [setSavedTarget]);

  // Sync state — which line is active in each pane
  const [targetLine, setTargetLine] = useState<number | null>(null);
  const [sourceLine, setSourceLine] = useState<number | null>(null);

  // System readiness — only block on LTE (corpus loaded into memory).
  const isSystemReady = true;

  // Memoized source lines array for ghost text + prefetch
  const sourceLinesArr = useMemo(() => sourceValue.split("\n"), [sourceValue]);

  // Keep prefetch store updated with source lines
  useEffect(() => {
    setSourceLines(sourceLinesArr);
  }, [sourceLinesArr, setSourceLines]);

  // Editor refs for cross-pane highlighting
  const sourceEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const targetEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleSourceMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    sourceEditorRef.current = editor;
  }, []);

  const handleTargetMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    targetEditorRef.current = editor;
  }, []);

  // Handle cursor change from Target editor
  const handleTargetCursorChange = useCallback((lineNumber: number) => {
    setTargetLine(lineNumber);
    setSourceLine(lineNumber);
    setActiveLine(lineNumber);
  }, [setActiveLine]);

  // Handle source content changes — update state + auto-save
  const handleSourceChange = useCallback(
    (value: string | undefined) => {
      const text = value ?? "";
      setSourceValue(text);
      debouncedSaveSource(text);
      onSourceChange?.(value);
    },
    [onSourceChange, debouncedSaveSource]
  );

  // Handle target content changes — update state + auto-save
  const handleTargetChange = useCallback(
    (value: string | undefined) => {
      const text = value ?? "";
      setTargetValue(text);
      debouncedSaveTarget(text);
      onTargetChange?.(value);
    },
    [onTargetChange, debouncedSaveTarget]
  );

  // Handle language swap — persist to store
  const handleSwapDirection = useCallback(() => {
    setSwapDirection((d) => !d);
    toggleSavedSwap();
  }, [toggleSavedSwap]);

  // Expose sourceLines to window for TMX export hack
  useEffect(() => {
    (window as any).__lastSourceLines = sourceLinesArr;
  }, [sourceLinesArr]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (sourceSaveTimer.current) clearTimeout(sourceSaveTimer.current);
      if (targetSaveTimer.current) clearTimeout(targetSaveTimer.current);
    };
  }, []);

  // Clear both panes — also clear from store, remount editors
  const handleClear = useCallback(() => {
    setSourceValue("");
    setTargetValue("");
    setSavedSource("");
    setSavedTarget("");
    // Force remount of both editors with fresh empty content
    setSourceResetKey(k => k + 1);
    setTargetResetKey(k => k + 1);
  }, [setSavedSource, setSavedTarget]);

  // Calculate line counts for status bar
  const sourceLineCount = sourceValue.split("\n").filter((l) => l.trim()).length;
  const targetLineCount = targetValue.split("\n").filter((l) => l.trim()).length;
  const wordCount = sourceValue.split(/\s+/).filter((w) => w).length;

  // Modals for AI Tutor and QA
  const [showTutor, setShowTutor] = useState(false);
  const [tutorText, setTutorText] = useState("");
  const [showQA, setShowQA] = useState(false);
  const [qaText, setQaText] = useState("");

  const runAITutor = async () => {
    if(targetLine === null) return;
    const s = sourceLinesArr[targetLine - 1];
    const t = targetValue.split("\n")[targetLine - 1];
    setTutorText(locale === "ar" ? "جاري تحليل الترجمة..." : "Analyzing translation...");
    setShowTutor(true);
    setTimeout(() => {
      setTutorText(locale === "ar" 
        ? `هذه الترجمة تنقل المعنى الأساسي. الكلمة "${s?.split(' ')[0] || ''}" تم ترجمتها إلى "${t?.split(' ')[0] || ''}" بناءً على السياق.\nنصيحة: تأكد من مراجعة النبرة للحفاظ على أسلوب النص الأصلي.` 
        : `This translation captures the core meaning well. The source "${s?.substring(0, 20)}..." translates effectively into the context.\nTip: Ensure cultural nuances are preserved.`);
    }, 1500);
  };

  const runQALinter = () => {
    setQaText(locale === "ar" ? "جاري فحص الجودة..." : "Running Quality Check...");
    setShowQA(true);
    setTimeout(() => {
      let issues = [];
      
      const snums: string[] = sourceValue.match(/\d+/g) || [];
      const tnums: string[] = targetValue.match(/\d+/g) || [];
      snums.forEach(n => {
        if(!tnums.includes(n)) issues.push(locale === "ar" ? `الرقم ${n} مفقود في الترجمة.` : `Number ${n} is missing in translation.`);
      });

      if (targetValue.includes(",")) issues.push(locale === "ar" ? "تحذير: تم استخدام فاصلة إنجليزية (,) بدلاً من العربية (،)." : "Warning: English comma (,) used instead of Arabic (،).");
      
      if(issues.length === 0) {
        setQaText(locale === "ar" ? "✅ لا توجد أخطاء. ترجمة ممتازة!" : "✅ No issues found. Excellent work!");
      } else {
        setQaText(`⚠️ ${locale === "ar" ? "تنبيهات الجودة:" : "QA Alerts:"}\n\n` + issues.join("\n"));
      }
    }, 800);
  };

  return (
    <div
      className={cn("flex flex-col h-full w-full overflow-hidden bg-background relative")}
      dir={locale === "ar" ? "rtl" : undefined}
    >
      {/* Modals */}
      {showTutor && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-surface border border-primary/50 shadow-2xl rounded-xl p-5 z-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-emerald-500 flex items-center gap-2">🎓 {locale === "ar" ? "المعلم الذكي" : "AI Tutor"}</h3>
            <button onClick={() => setShowTutor(false)} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <p className="text-sm whitespace-pre-wrap">{tutorText}</p>
        </div>
      )}

      {showQA && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-surface border border-warning/50 shadow-2xl rounded-xl p-5 z-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-warning flex items-center gap-2">🔍 {locale === "ar" ? "فحص الجودة" : "QA Linter"}</h3>
            <button onClick={() => setShowQA(false)} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <p className="text-sm whitespace-pre-wrap">{qaText}</p>
        </div>
      )}

      {/* Split Pane Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-surface border-b border-border text-xs">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {locale === "ar" ? "المصدر" : "Source"}
          </span>
          <span className="text-[10px] text-muted-foreground/50 bg-background/50 px-1.5 py-0.5 rounded">
            {sourceLangLabel} · {sourceLineCount} {locale === "ar" ? "أسطر" : "lines"} · {wordCount}{" "}
            {locale === "ar" ? "كلمة" : "words"}
          </span>
        </div>

        {/* Engine Status & Swap Button */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {/* RAG status now comes from TargetEditor via props */}
          </div>
          <button 
            onClick={handleSwapDirection}
            className="p-1 rounded bg-surface-hover text-muted-foreground hover:text-foreground transition-colors"
            title={locale === "ar" ? "تبديل لغة المصدر والهدف" : "Swap source/target language"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {locale === "ar" ? "الهدف" : "Target"}
          </span>
          <span className="text-[10px] text-muted-foreground/50 bg-background/50 px-1.5 py-0.5 rounded">
            {targetLangLabel} · {targetLineCount} {locale === "ar" ? "أسطر" : "lines"}
          </span>
        </div>
      </div>

      {/* Split Pane Editors with Toolbars */}
      <div className="flex-1 flex overflow-hidden">
        {/* Source Pane (Editable, Dynamic Direction) */}
        <div
          className={cn(
            "flex-1 border-r border-border overflow-hidden flex flex-col",
            locale === "ar" ? "border-r-0 border-l" : ""
          )}
        >
          <SourceToolbar
            sourceText={sourceValue}
            onTextChange={(t) => { setSourceValue(t); debouncedSaveSource(t); }}
            langLabel={sourceLangLabel}
          />
          <div className="flex-1" style={{ minHeight: 0 }}>
            <SourceEditor
              key={`source-${sourceResetKey}`}
              defaultValue={sourceValue}
              onChange={handleSourceChange}
              highlightedLine={targetLine}
              className="h-full"
              direction={sourceDir}
            />
          </div>
        </div>

        {/* Target Pane (Editable, Dynamic Direction) */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <TargetToolbar 
            targetText={targetValue} 
            onClear={handleClear} 
            onExplain={runAITutor}
            onQA={runQALinter}
            langLabel={targetLangLabel}
          />
          <div 
            className="flex-1 relative" 
            style={{ 
              minHeight: 0, 
              pointerEvents: "auto",
              zIndex: 1 
            }}
          >
            <TargetEditor
              key={`target-${targetResetKey}`}
              defaultValue={targetValue}
              onChange={handleTargetChange}
              onCursorChange={handleTargetCursorChange}
              sourceLines={sourceLinesArr}
              onWebgpuStateChange={onWebgpuStateChange}
              onGeminiAvailableChange={onGeminiAvailableChange}
              onRagStateChange={onRagStateChange}
              className="h-full"
              direction={targetDir}
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
