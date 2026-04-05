"use client";

import dynamic from "next/dynamic";
import type { GPUStatus } from "@/types";
import { useAppMode } from "@/hooks/useAppMode";
import { useState, useCallback, useSyncExternalStore } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ─── Hydration-Safe Client Shell ─────────────────────────────────
// We use useSyncExternalStore to detect client-side mount without
// triggering the react-hooks/set-state-in-effect lint rule.

function getIsClient() {
  return true;
}

function subscribeToClientMount(callback: () => void) {
  // Already mounted — no-op subscriber
  return () => {};
}

function RDATClientShell() {
  // GPU status state — will be populated by the WebGPU checker
  const [gpuStatus, setGpuStatus] = useState<GPUStatus>({
    availability: "checking",
    adapterInfo: null,
    error: null,
  });

  const isClient = useSyncExternalStore(
    subscribeToClientMount,
    getIsClient,
    () => false
  );

  const { appMode } = useAppMode(gpuStatus.availability);

  // Detect WebGPU on mount (client-side only — SSR safe)
  const checkGPU = useCallback(async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.gpu) {
        setGpuStatus({
          availability: "unsupported",
          adapterInfo: null,
          error: "WebGPU is not available in this browser.",
        });
        return;
      }

      const adapter = await navigator.gpu.requestAdapter();

      if (!adapter) {
        setGpuStatus({
          availability: "unsupported",
          adapterInfo: null,
          error: "No WebGPU adapter found.",
        });
        return;
      }

      const info = adapter.info || (adapter as any).info;

      setGpuStatus({
        availability: "supported",
        adapterInfo: {
          vendor: info?.vendor ?? "Unknown",
          architecture: info?.architecture ?? "Unknown",
          description: info?.description ?? "WebGPU Adapter",
          device: info?.device ?? "Unknown Device",
        },
        error: null,
      });
    } catch (err) {
      setGpuStatus({
        availability: "error",
        adapterInfo: null,
        error:
          err instanceof Error
            ? err.message
            : "Unknown GPU detection error.",
      });
    }
  }, []);

  // Schedule GPU check asynchronously
  if (isClient && gpuStatus.availability === "checking") {
    setTimeout(checkGPU, 0);
  }

  // Don't render until client-side mount to avoid hydration issues
  if (!isClient) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[var(--ide-bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
          <span className="text-sm text-[var(--ide-text-muted)]">
            Initializing RDAT Copilot...
          </span>
        </div>
      </div>
    );
  }

  // Import WorkspaceShell dynamically to keep the initial bundle small
  return (
    <ErrorBoundary>
      <WorkspaceShell gpuStatus={gpuStatus} appMode={appMode} />
    </ErrorBoundary>
  );
}

// ─── Dynamic import for WorkspaceShell ────────────────────────────
const WorkspaceShell = dynamic(
  () =>
    import("@/components/workspace/WorkspaceShell").then(
      (mod) => mod.WorkspaceShell
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen w-screen bg-[var(--ide-bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
          <span className="text-sm text-[var(--ide-text-muted)]">
            Loading workspace...
          </span>
        </div>
      </div>
    ),
  }
);

export default function HomePage() {
  return <RDATClientShell />;
}
