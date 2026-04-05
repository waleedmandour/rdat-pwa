/**
 * WebGPU type declarations for TypeScript.
 *
 * TypeScript's default "dom" lib does not yet include WebGPU types.
 * This file provides the minimal declarations needed for the
 * RDAT Copilot GPU detection utilities (navigator.gpu, requestAdapter, etc.).
 */

interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
}

interface GPUAdapter {
  info?: GPUAdapterInfo;
  requestDevice(): Promise<GPUDevice>;
}

interface GPUAdapterInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}

interface GPURequestAdapterOptions {
  powerPreference?: GPUPowerPreference;
}

type GPUPowerPreference = "low-power" | "high-performance";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface GPUDevice {}

interface Navigator {
  readonly gpu?: GPU;
}
