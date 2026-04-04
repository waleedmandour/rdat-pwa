"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { GPUStatus } from "@/types";
import { detectGPU } from "@/lib/gpu-utils";
import { GPU_CHECK_TIMEOUT_MS } from "@/lib/constants";

/**
 * useWebGPU — SSR-safe hook that checks WebGPU availability on mount.
 *
 * CRITICAL: This hook ONLY runs on the client. All navigator.gpu access
 * is deferred to useEffect to prevent hydration mismatches and SSR crashes.
 */
export function useWebGPU() {
  const [gpuStatus, setGpuStatus] = useState<GPUStatus>({
    availability: "checking",
    adapterInfo: null,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const checkGPU = useCallback(async (signal?: AbortSignal) => {
    // Set checking state — inside async callback, not directly in effect
    setGpuStatus({
      availability: "checking",
      adapterInfo: null,
      error: null,
    });

    try {
      // Race between GPU detection and timeout
      const result = await Promise.race([
        detectGPU(),
        new Promise<GPUStatus>((resolve) =>
          setTimeout(() => {
            resolve({
              availability: "error",
              adapterInfo: null,
              error: "WebGPU check timed out.",
            });
          }, GPU_CHECK_TIMEOUT_MS)
        ),
      ]);

      // Don't update state if the call was aborted
      if (signal?.aborted) return;

      setGpuStatus(result);
    } catch (err) {
      if (signal?.aborted) return;
      setGpuStatus({
        availability: "error",
        adapterInfo: null,
        error:
          err instanceof Error ? err.message : "Unknown GPU detection error.",
      });
    }
  }, []);

  useEffect(() => {
    // Abort any previous check
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Schedule the check asynchronously to avoid direct setState in effect
    const timeoutId = setTimeout(() => {
      checkGPU(controller.signal);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [checkGPU]);

  // Convenience booleans
  const isAvailable: boolean = gpuStatus.availability === "supported";
  const isChecking: boolean = gpuStatus.availability === "checking";
  const isUnsupported: boolean = gpuStatus.availability === "unsupported";
  const hasError: boolean = gpuStatus.availability === "error";

  const retry = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    checkGPU(controller.signal);
  }, [checkGPU]);

  return {
    gpuStatus,
    isAvailable,
    isChecking,
    isUnsupported,
    hasError,
    retry,
  };
}
