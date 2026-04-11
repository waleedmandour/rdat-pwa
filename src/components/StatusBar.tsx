"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Cpu, Cloud, Zap, Database } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export type EngineMode = "hybrid" | "local" | "cloud";
export type GTRStatus = "active" | "zero-shot";
export type WebGPUState = "ready" | "unavailable" | "loading" | "downloading" | "generating" | "error" | "initializing";

export interface WebGPUInfo {
  state: WebGPUState;
  progress?: { text: string; percentage: number };
  error?: string | null;
}

interface StatusBarProps {
  engineMode?: EngineMode;
  gtrStatus?: GTRStatus;
  webgpuInfo?: WebGPUInfo;
  geminiAvailable?: boolean;
  segmentCount?: number;
  wordCount?: number;
}

const EngineModeBadge: React.FC<{ mode: EngineMode }> = ({ mode }) => {
  const { t } = useLanguage();
  const config = {
    hybrid: {
      label: t("status.engine.hybrid"),
      bg: "bg-primary-muted text-primary",
      icon: <Zap className="w-3 h-3" />,
    },
    local: {
      label: t("status.engine.local"),
      bg: "bg-blue-900/40 text-blue-400",
      icon: <Cpu className="w-3 h-3" />,
    },
    cloud: {
      label: t("status.engine.cloud"),
      bg: "bg-purple-900/40 text-purple-400",
      icon: <Cloud className="w-3 h-3" />,
    },
  };
  const { label, bg, icon } = config[mode];

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold",
        bg
      )}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
};

const GTRBadge: React.FC<{ status: GTRStatus }> = ({ status }) => {
  const { t } = useLanguage();
  const isActive = status === "active";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold",
        isActive ? "bg-primary-muted text-primary" : "bg-warning-bg text-warning"
      )}
    >
      <Database className="w-3 h-3" />
      <span>{isActive ? t("status.gtr.active") : t("status.gtr.zeroShot")}</span>
    </div>
  );
};

const WebGPUBadge: React.FC<{ info: WebGPUInfo }> = ({ info }) => {
  const { t, locale } = useLanguage();
  const isRTL = locale === "ar";

  const config: Record<WebGPUState, { icon: React.ReactNode; bg: string; label: string }> = {
    ready: {
      icon: <Wifi className="w-3 h-3" />,
      bg: "bg-primary-muted text-primary",
      label: t("status.webgpu.ready"),
    },
    unavailable: {
      icon: <WifiOff className="w-3 h-3" />,
      bg: "bg-warning-bg text-warning",
      label: t("status.webgpu.unavailable"),
    },
    loading: {
      icon: <Cpu className="w-3 h-3 animate-pulse" />,
      bg: "bg-blue-900/40 text-blue-400",
      label: t("status.webgpu.loading"),
    },
    initializing: {
      icon: <Cpu className="w-3 h-3 animate-pulse" />,
      bg: "bg-blue-900/40 text-blue-400",
      label: isRTL ? "جاري التهيئة..." : "Initializing...",
    },
    downloading: {
      icon: <Cpu className="w-3 h-3 animate-pulse" />,
      bg: "bg-blue-900/40 text-blue-400",
      label: "WebGPU Downloading...",
    },
    generating: {
      icon: <Zap className="w-3 h-3 animate-pulse" />,
      bg: "bg-primary/20 text-primary",
      label: isRTL ? "يولّد..." : "Generating...",
    },
    error: {
      icon: <WifiOff className="w-3 h-3" />,
      bg: "bg-error-bg text-error",
      label: "WebGPU Error",
    },
  };

  const { icon, bg } = config[info.state] ?? config.unavailable;

  // For downloading state, show progress
  let label: string;
  if (info.state === "downloading" && info.progress) {
    label = `WebGPU ${info.progress.percentage.toFixed(0)}%`;
  } else if (info.state === "error" && info.error) {
    label = info.error.substring(0, 30);
  } else {
    label = config[info.state]?.label ?? "";
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold max-w-[200px]",
        bg
      )}
    >
      {icon}
      <span className="truncate" title={info.progress?.text || info.error || undefined}>
        {label}
      </span>
    </div>
  );
};

export function StatusBar({
  engineMode = "hybrid",
  gtrStatus = "zero-shot",
  webgpuInfo = { state: "loading" },
  geminiAvailable = false,
  segmentCount = 0,
  wordCount = 0,
}: StatusBarProps) {
  const { t, locale } = useLanguage();
  const isRTL = locale === "ar";

  return (
    <footer
      className="h-7 bg-sidebar border-t border-border flex items-center justify-between px-3 text-xs select-none"
      dir={isRTL ? "rtl" : undefined}
    >
      {/* Left Section: Engine Status */}
      <div className="flex items-center gap-3">
        <EngineModeBadge mode={engineMode} />
        <GTRBadge status={gtrStatus} />
        <WebGPUBadge info={webgpuInfo} />
        {geminiAvailable && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-900/40 text-purple-400">
            <Cloud className="w-3 h-3" />
            <span>Gemini</span>
          </div>
        )}
      </div>

      {/* Right Section: Document Stats */}
      <div className="flex items-center gap-4 text-muted-foreground">
        <span>
          {t("status.segments")}{" "}
          <span className="text-foreground font-medium">{segmentCount}</span>
        </span>
        <span>
          {t("status.words")}{" "}
          <span className="text-foreground font-medium">{wordCount}</span>
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {t("status.footer")}
        </span>
      </div>
    </footer>
  );
}
