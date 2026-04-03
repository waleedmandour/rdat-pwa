// ─── App Mode ───────────────────────────────────────────────────────
export type AppMode = "local" | "cloud" | "hybrid";

// ─── GPU Status ─────────────────────────────────────────────────────
export type GPUAvailabilityStatus =
  | "checking"
  | "supported"
  | "unsupported"
  | "error";

export interface GPUAdapterInfo {
  vendor: string;
  architecture: string;
  description: string;
  device: string;
}

export interface GPUStatus {
  availability: GPUAvailabilityStatus;
  adapterInfo: GPUAdapterInfo | null;
  error: string | null;
}

// ─── App State ──────────────────────────────────────────────────────
export interface AppState {
  gpuStatus: GPUStatus;
  appMode: AppMode;
  isDarkMode: boolean;
}

// ─── Inference Engine State ─────────────────────────────────────────
export type InferenceState = "idle" | "running" | "aborted" | "completed";

// ─── Translation Context ────────────────────────────────────────────
export interface TranslationPair {
  source: string;
  target: string;
  sourceLang: string;
  targetLang: string;
}

// ─── Editor State ───────────────────────────────────────────────────
export interface EditorTab {
  id: string;
  title: string;
  language: string;
  content: string;
  isDirty: boolean;
}

// ─── Settings ───────────────────────────────────────────────────────
export interface AppSettings {
  geminiApiKey: string;
  sourceLanguage: string;
  targetLanguage: string;
  autoSuggest: boolean;
  localModelEnabled: boolean;
  cloudModelEnabled: boolean;
}

// ─── Lint Marker ────────────────────────────────────────────────────
export type LintSeverity = "error" | "warning" | "info";

export interface LintMarker {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: LintSeverity;
  source: string;
}
