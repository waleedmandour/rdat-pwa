"use client";

import { useMemo } from "react";
import type { AppMode } from "@/types";
import type { GPUAvailabilityStatus } from "@/types";
import { deriveAppMode } from "@/lib/gpu-utils";

/**
 * useAppMode — Derives the application mode from GPU availability.
 *
 * - "hybrid" → Both local WebGPU + cloud Gemini are available
 * - "cloud"  → WebGPU unavailable; graceful degradation to cloud-only
 * - "local"  → Reserved for future offline-only mode
 */
export function useAppMode(gpuAvailability: GPUAvailabilityStatus): {
  appMode: AppMode;
  isLocal: boolean;
  isCloud: boolean;
  isHybrid: boolean;
} {
  const appMode = useMemo(
    () => deriveAppMode(gpuAvailability),
    [gpuAvailability]
  );

  return {
    appMode,
    isLocal: appMode === "local",
    isCloud: appMode === "cloud",
    isHybrid: appMode === "hybrid",
  };
}
