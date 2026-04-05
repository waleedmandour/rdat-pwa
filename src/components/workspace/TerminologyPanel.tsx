"use client";

import { useState, useEffect, useRef } from "react";
import type { RAGResult, RAGState } from "@/lib/rag-types";
import { ChevronDown, ChevronRight, Database, MessageSquareDashed, BookOpen, FileText } from "lucide-react";

interface TerminologyPanelProps {
  results: RAGResult[];
  ragState: RAGState;
}

/**
 * TermRow — Renders a single terminology match row with type icon,
 * EN→AR terms, AMTA badge, and similarity score.
 */
function TermRow({ result }: { result: RAGResult }) {
  const isTM = result.type === "translation_memory";
  const isStrict = result.amta_enforcement === "strict";

  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2 rounded transition-colors hover:bg-[var(--ide-hover)] group ${
        isTM ? "border-l-2 border-l-sky-500/30" : ""
      }`}
    >
      {/* Type icon */}
      {isTM ? (
        <span title="Translation Memory">
          <FileText className="w-3 h-3 text-sky-400/60 flex-shrink-0" />
        </span>
      ) : (
        <span title="Terminology">
          <BookOpen className="w-3 h-3 text-teal-400/60 flex-shrink-0" />
        </span>
      )}

      {/* EN Term */}
      <span
        className={`text-[11px] truncate min-w-0 ${
          isTM
            ? "text-[var(--ide-text-muted)] italic"
            : "text-[var(--ide-text)]"
        }`}
      >
        {result.en}
      </span>

      {/* Arrow */}
      <span className="text-[10px] text-[var(--ide-text-dim)] flex-shrink-0">
        →
      </span>

      {/* AR Term */}
      <span
        className="text-[11px] text-amber-300/80 truncate min-w-0"
        dir="rtl"
      >
        {result.ar}
      </span>

      {/* AMTA enforcement badge */}
      {isStrict && (
        <span className="text-[8px] px-1 py-0 rounded bg-red-500/10 text-red-400/70 flex-shrink-0">
          AMTA
        </span>
      )}

      {/* Similarity score badge */}
      <span
        className={`text-[9px] px-1.5 py-0 rounded-full flex-shrink-0 font-medium tabular-nums ${
          result.score >= 0.8
            ? "bg-emerald-500/15 text-emerald-400"
            : result.score >= 0.6
              ? "bg-amber-500/15 text-amber-400"
              : "bg-[var(--ide-bg-tertiary)] text-[var(--ide-text-dim)]"
        }`}
      >
        {(result.score * 100).toFixed(0)}%
      </span>
    </div>
  );
}

/**
 * TerminologyPanel — Displays RAG terminology match results in a collapsible panel.
 *
 * Placed at the bottom of the Source Pane (standard CAT tool UX), it shows:
 * - A header with bilingual title, match count, and collapse chevron
 * - A scrollable list of term pairs (EN → AR) with type icons and similarity badges
 * - Translation Memory entries are visually distinguished from Terminology entries
 * - A subtle empty state when no matches are found
 */
export function TerminologyPanel({ results, ragState }: TerminologyPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new results arrive
  useEffect(() => {
    if (scrollRef.current && (results?.length ?? 0) > 0 && isOpen) {
      scrollRef.current.scrollTop = 0;
    }
  }, [results, isOpen]);

  // Don't render if RAG hasn't been initialized at all
  if (ragState === "idle") {
    return null;
  }

  const hasResults = (results?.length ?? 0) > 0;

  return (
    <div className="border-t border-[var(--ide-border)] bg-[var(--ide-bg-secondary)]">
      {/* Header */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-between w-full h-7 px-3 text-[11px] select-none hover:bg-[var(--ide-hover)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Database className="w-3 h-3 text-teal-400" />
          <span className="text-[var(--ide-text-muted)]">
            Terminology Matches
          </span>
          <span
            className="text-[9px] text-[var(--ide-text-dim)]"
            dir="rtl"
          >
            تطابق المصطلحات
          </span>
          {hasResults && (
            <span className="text-[10px] px-1.5 py-0 rounded-full bg-teal-500/15 text-teal-400 font-medium tabular-nums">
              {results?.length ?? 0}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {ragState === "searching" && (
            <span className="text-[10px] text-amber-400 animate-pulse">
              Searching…
            </span>
          )}
          {isOpen ? (
            <ChevronDown className="w-3 h-3 text-[var(--ide-text-dim)]" />
          ) : (
            <ChevronRight className="w-3 h-3 text-[var(--ide-text-dim)]" />
          )}
        </div>
      </button>

      {/* Body */}
      {isOpen && (
        <div
          ref={scrollRef}
          className="max-h-[180px] overflow-y-auto px-3 pb-2 space-y-0.5"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "var(--ide-border) transparent",
          }}
        >
          {hasResults ? (
            results.map((result, index) => (
              <TermRow
                key={`${result.id}-${index}`}
                result={result}
              />
            ))
          ) : ragState === "ready" ? (
            <div className="flex items-center gap-2 py-3 px-2 text-[var(--ide-text-dim)]">
              <MessageSquareDashed className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
              <span className="text-[10px]">
                No matches for current sentence
              </span>
              <span className="text-[9px]" dir="rtl">
                لا توجد تطابقات
              </span>
            </div>
          ) : ragState === "error" ? (
            <div className="flex items-center gap-2 py-3 px-2 text-red-400/70">
              <span className="text-[10px]">
                RAG search unavailable
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
