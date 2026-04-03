"use client";

import { Cpu, Cloud, Zap } from "lucide-react";
import type { GPUStatus, AppMode } from "@/types";
import { formatGPULabel, getGPUStatusDotColor } from "@/lib/gpu-utils";
import { MODE_LABELS, GPU_STATUS_LABELS } from "@/lib/constants";

interface StatusBarProps {
  gpuStatus: GPUStatus;
  appMode: AppMode;
}

export function StatusBar({ gpuStatus, appMode }: StatusBarProps) {
  return (
    <footer className="flex items-center justify-between h-7 px-3 border-t border-[var(--ide-border)] bg-[var(--ide-statusbar)] text-[11px] select-none">
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* App mode indicator */}
        <div className="flex items-center gap-1.5 text-[var(--ide-text-muted)]">
          {appMode === "hybrid" && <Zap className="w-3 h-3 text-emerald-400" />}
          {appMode === "cloud" && (
            <Cloud className="w-3 h-3 text-sky-400" />
          )}
          {appMode === "local" && (
            <Cpu className="w-3 h-3 text-amber-400" />
          )}
          <span>{MODE_LABELS[appMode]}</span>
        </div>

        {/* Separator */}
        <span className="text-[var(--ide-border)]">│</span>

        {/* Language pair */}
        <span className="text-[var(--ide-text-muted)]">
          EN → AR
        </span>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
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

        {/* Separator */}
        <span className="text-[var(--ide-border)]">│</span>

        {/* Version */}
        <span className="text-[var(--ide-text-dim)]">v0.1.0</span>
      </div>
    </footer>
  );
}
