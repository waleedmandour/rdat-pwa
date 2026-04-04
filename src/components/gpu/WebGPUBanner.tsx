"use client";

import { AlertTriangle, RefreshCw, Cpu } from "lucide-react";
import type { GPUStatus } from "@/types";

interface WebGPUBannerProps {
  gpuStatus: GPUStatus;
  onRetry?: () => void;
}

/**
 * WebGPUBanner — Displays a warning banner when WebGPU is unavailable.
 * This enables graceful degradation: the user is informed that local
 * AI features are disabled, and the app switches to Cloud-Only mode.
 */
export function WebGPUBanner({ gpuStatus, onRetry }: WebGPUBannerProps) {
  const showBanner =
    gpuStatus.availability === "unsupported" ||
    gpuStatus.availability === "error";

  if (!showBanner) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-amber-200 font-medium">
          WebGPU Not Available — Running in Cloud-Only Mode
        </p>
        <p className="text-[11px] text-amber-300/60 mt-0.5 truncate">
          {gpuStatus.error ||
            "Local AI model features (Sovereign Track) are disabled. Cloud features via Gemini API remain fully functional. Use Chrome 113+ or Edge 113+ for WebGPU support."}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium text-amber-200 hover:text-amber-100 bg-amber-500/20 hover:bg-amber-500/30 transition-colors flex-shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      )}
    </div>
  );
}
