import type { GPUAdapterInfo, GPUStatus, GPUAvailabilityStatus } from "@/types";

/**
 * Pure utility to check WebGPU availability.
 * Must ONLY be called from the client side (useEffect or dynamic import).
 */
export async function detectGPU(): Promise<GPUStatus> {
  try {
    if (typeof navigator === "undefined" || !navigator.gpu) {
      return {
        availability: "unsupported",
        adapterInfo: null,
        error: "WebGPU is not available in this browser.",
      };
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      return {
        availability: "unsupported",
        adapterInfo: null,
        error: "No WebGPU adapter found. Your GPU may not support WebGPU.",
      };
    }

    const adapterInfo = adapter.info || (adapter as any).info;

    const info: GPUAdapterInfo = {
      vendor: adapterInfo?.vendor ?? "Unknown",
      architecture: adapterInfo?.architecture ?? "Unknown",
      description: adapterInfo?.description ?? "WebGPU Adapter",
      device: adapterInfo?.device ?? "Unknown Device",
    };

    return {
      availability: "supported",
      adapterInfo: info,
      error: null,
    };
  } catch (err) {
    return {
      availability: "error",
      adapterInfo: null,
      error:
        err instanceof Error ? err.message : "An unknown WebGPU error occurred.",
    };
  }
}

/**
 * Derives the app mode from GPU availability.
 * - "supported" → "hybrid" (both local + cloud available)
 * - "unsupported"/"error" → "cloud" (graceful degradation)
 */
export function deriveAppMode(
  availability: GPUAvailabilityStatus
): "local" | "cloud" | "hybrid" {
  switch (availability) {
    case "supported":
      return "hybrid";
    case "unsupported":
    case "error":
    case "checking":
    default:
      return "cloud";
  }
}

/**
 * Returns a human-readable label for the GPU adapter.
 */
export function formatGPULabel(info: GPUAdapterInfo | null): string {
  if (!info) return "No GPU Detected";
  const parts = [info.vendor, info.architecture, info.device].filter(
    (p) => p && p !== "Unknown"
  );
  return parts.length > 0 ? parts.join(" · ") : "WebGPU Adapter";
}

/**
 * Status color mapping for the GPU indicator.
 */
export function getGPUStatusColor(
  availability: GPUAvailabilityStatus
): string {
  switch (availability) {
    case "supported":
      return "text-emerald-400";
    case "checking":
      return "text-yellow-400";
    case "unsupported":
      return "text-red-400";
    case "error":
      return "text-red-500";
  }
}

/**
 * Status dot color (background) mapping.
 */
export function getGPUStatusDotColor(
  availability: GPUAvailabilityStatus
): string {
  switch (availability) {
    case "supported":
      return "bg-emerald-400";
    case "checking":
      return "bg-yellow-400 animate-pulse";
    case "unsupported":
      return "bg-red-400";
    case "error":
      return "bg-red-500";
  }
}
