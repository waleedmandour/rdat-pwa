"use client";

import {
  Cpu,
  Cloud,
  Zap,
  Loader2,
  Database,
} from "lucide-react";
import type { GPUStatus, AppMode, InferenceState } from "@/types";
import type { RAGState, RAGTiming } from "@/lib/rag-types";
import { formatGPULabel, getGPUStatusDotColor } from "@/lib/gpu-utils";
import {
  MODE_LABELS,
  GPU_STATUS_LABELS,
  INFERENCE_STATE_LABELS,
  RAG_STATE_LABELS,
} from "@/lib/constants";

interface StatusBarProps {
  gpuStatus: GPUStatus;
  appMode: AppMode;
  inferenceState: InferenceState;
  ragState: RAGState;
  ragTiming: RAGTiming | null;
  embeddingMode: "real" | "fallback";
  ragStatusMessage: string;
  ragResultCount: number;
}

function getRAGStateColor(state: RAGState): string {
  switch (state) {
    case "ready":
      return "text-emerald-400";
    case "loading-model":
    case "indexing":
      return "text-amber-400";
    case "searching":
      return "text-teal-400";
    case "error":
      return "text-red-400";
    default:
      return "text-[var(--ide-text-muted)]";
  }
}

function getRAGStateDot(state: RAGState): string {
  switch (state) {
    case "ready":
      return "bg-emerald-400";
    case "loading-model":
    case "indexing":
      return "bg-amber-400 animate-pulse";
    case "searching":
      return "bg-teal-400 animate-pulse";
    case "error":
      return "bg-red-400";
    default:
      return "bg-[var(--ide-text-dim)]";
  }
}

export function StatusBar({
  gpuStatus,
  appMode,
  inferenceState,
  ragState,
  ragTiming,
  embeddingMode,
  ragStatusMessage,
  ragResultCount,
}: StatusBarProps) {
  return (
    <footer className="flex items-center justify-between h-7 px-3 border-t border-[var(--ide-border)] bg-[var(--ide-statusbar)] text-[11px] select-none">
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* App mode indicator */}
        <div className="flex items-center gap-1.5 text-[var(--ide-text-muted)]">
          {appMode === "hybrid" && (
            <Zap className="w-3 h-3 text-emerald-400" />
          )}
          {appMode === "cloud" && (
            <Cloud className="w-3 h-3 text-sky-400" />
          )}
          {appMode === "local" && (
            <Cpu className="w-3 h-3 text-amber-400" />
          )}
          <span>{MODE_LABELS[appMode]}</span>
        </div>

        <span className="text-[var(--ide-border)]">│</span>

        {/* Language pair */}
        <span className="text-[var(--ide-text-muted)]">EN → AR</span>

        <span className="text-[var(--ide-border)]">│</span>

        {/* Inference Engine Status */}
        <div className="flex items-center gap-1.5">
          {inferenceState === "running" ? (
            <Loader2 className="w-3 h-3 text-teal-400 animate-spin" />
          ) : (
            <span
              className={`w-2 h-2 rounded-full ${
                inferenceState === "completed"
                  ? "bg-emerald-400"
                  : inferenceState === "aborted"
                  ? "bg-amber-400"
                  : "bg-[var(--ide-text-dim)]"
              }`}
            />
          )}
          <span
            className={
              inferenceState === "running"
                ? "text-teal-400"
                : inferenceState === "completed"
                ? "text-emerald-400"
                : inferenceState === "aborted"
                ? "text-amber-400"
                : "text-[var(--ide-text-muted)]"
            }
          >
            AI: {INFERENCE_STATE_LABELS[inferenceState]}
          </span>
        </div>

        <span className="text-[var(--ide-border)]">│</span>

        {/* RAG / GTR Status */}
        <div className="flex items-center gap-1.5">
          {ragState === "loading-model" || ragState === "indexing" || ragState === "searching" ? (
            <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
          ) : (
            <span className={`w-2 h-2 rounded-full ${getRAGStateDot(ragState)}`} />
          )}
          <span className={getRAGStateColor(ragState)}>
            {RAG_STATE_LABELS[ragState]}
          </span>
          {/* Embedding mode badge */}
          {ragState === "ready" && (
            <span
              className={`text-[9px] px-1 py-0.5 rounded ${
                embeddingMode === "real"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}
            >
              {embeddingMode === "real" ? "ML" : "HASH"}
            </span>
          )}
          {/* Search timing when available */}
          {ragTiming && ragState === "ready" && (
            <span className="text-[var(--ide-text-dim)]">
              ({ragTiming.searchMs.toFixed(0)}ms)
            </span>
          )}
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* RAG Results count */}
        {ragResultCount > 0 && ragState === "ready" && (
          <>
            <div className="flex items-center gap-1 text-[var(--ide-text-dim)]">
              <Database className="w-3 h-3" />
              <span>{ragResultCount} matches</span>
            </div>
            <span className="text-[var(--ide-border)]">│</span>
          </>
        )}

        {/* Ghost Text hint */}
        <span className="text-[var(--ide-text-dim)] hidden md:inline">
          Tab to accept · Ghost text active
        </span>

        <span className="text-[var(--ide-border)] hidden md:inline">│</span>

        {/* GPU Status */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${getGPUStatusDotColor(gpuStatus.availability)}`}
          />
          <span className="text-[var(--ide-text-muted)]">
            {GPU_STATUS_LABELS[gpuStatus.availability]}
          </span>
          {gpuStatus.adapterInfo && (
            <span className="text-[var(--ide-text-dim)] hidden lg:inline">
              — {formatGPULabel(gpuStatus.adapterInfo)}
            </span>
          )}
        </div>

        <span className="text-[var(--ide-border)]">│</span>

        {/* Version */}
        <span className="text-[var(--ide-text-dim)]">v0.3.0</span>
      </div>
    </footer>
  );
}
