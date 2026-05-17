"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { MLCEngineInterface, InitProgressReport } from "@mlc-ai/web-llm";
import { useSettingsStore } from "@/stores/settings-store";

export type WebLLMState = 
  | "unavailable"
  | "idle"           // WebGPU adapter found, model not loaded yet
  | "initializing"
  | "downloading"
  | "loading"
  | "ready"
  | "generating"
  | "error"
  | "recovering";

interface WebLLMProgress {
  text: string;
  percentage: number;
}

interface WebLLMResult {
  text: string;
  aborted: boolean;
}

interface WebLLMRecoveryState {
  retryCount: number;
  lastRetryTime: number;
  backoffDelays: number[]; // [1s, 2s, 4s, 8s, 16s, 30s]
}

/** Timeout for CreateWebWorkerMLCEngine — prevents getting stuck at "initializing" */
const ENGINE_INIT_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * useWebLLM — WebGPU Neural Network with Exponential Backoff Recovery.
 * 
 * Features:
 *  - Exponential backoff on initialization failure (1s → 30s)
 *  - Health check to verify engine still works
 *  - Auto-recovery on generation failure
 *  - Max 5 retries before giving up
 *  - Proper cleanup on unmount
 *  - Auto-initialization when model is cached (fast load from browser cache)
 *  - Timeout protection to prevent getting stuck at "initializing"
 *
 * State Flow:
 *  unavailable → idle → initializing → downloading/loading → ready → generating
 *                    ↑                                    ↓
 *                    └── error/recovering (with backoff) ←┘
 *
 * The key design decision: the ghost text provider only calls generateBurst()
 * when the engine is ready (isReady === true). The engine initialization
 * happens automatically when:
 *  1. WebGPU adapter is found (state: idle)
 *  2. AND the selected model is already cached in the browser
 * This way:
 *  - "WebGPU Available" is shown when adapter is found but model isn't loaded
 *  - "Initializing..." is shown briefly during model loading
 *  - "Ready" is shown when the model is loaded and ready to use
 *  - The engine never gets stuck at "initializing" because of timeout protection
 */
export function useWebLLM() {
  const [state, setState] = useState<WebLLMState>("unavailable");
  const [progress, setProgress] = useState<WebLLMProgress>({ text: "", percentage: 0 });
  const [error, setError] = useState<string | null>(null);
  
  const engineRef = useRef<MLCEngineInterface | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isClientRef = useRef(false);
  const initAttemptRef = useRef(0); // Guards against concurrent initEngine calls
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitializingRef = useRef(false); // Prevents concurrent initEngine calls
  
  const recoveryStateRef = useRef<WebLLMRecoveryState>({
    retryCount: 0,
    lastRetryTime: 0,
    backoffDelays: [1000, 2000, 4000, 8000, 16000, 30000], // ms
  });
  
  const selectedModel = useSettingsStore((s) => s.webLLMModel);

  // Check WebGPU availability on mount (SSR safe)
  useEffect(() => {
    isClientRef.current = typeof window !== "undefined";
    
    if (!isClientRef.current) return;
    
    // Check for WebGPU support
    if (!("gpu" in navigator)) {
      setState("unavailable");
      setError("WebGPU is not supported in this browser");
      return;
    }
    
    // Check for adapter
    (navigator as any).gpu.requestAdapter().then(
      (adapter: any) => {
        if (!adapter) {
          setState("unavailable");
          setError("No WebGPU adapter found");
          return;
        }
        // WebGPU adapter found — transition to "idle" state.
        // This tells the UI that WebGPU IS available, but the model
        // hasn't been loaded yet. The StatusBar shows "WebGPU Available".
        setState("idle");
        setError(null);
        console.log("[WebLLM] WebGPU adapter found — engine will load on first use");
      },
      () => {
        setState("unavailable");
        setError("WebGPU adapter request failed");
      }
    );
  }, []);

  /**
   * Health check: Verify engine still works.
   */
  const healthCheck = useCallback(async (): Promise<boolean> => {
    if (!engineRef.current) return false;
    
    try {
      const response = await engineRef.current.chat.completions.create({
        messages: [{ role: "user", content: "OK" }],
        max_tokens: 1,
        temperature: 0.1,
      });
      return !!response.choices[0]?.message?.content;
    } catch {
      return false;
    }
  }, []);

  /**
   * Initialize the engine with exponential backoff retry.
   * Checks if the model is already cached before starting download.
   * Includes timeout protection to prevent getting stuck at "initializing".
   */
  const initEngine = useCallback(async (): Promise<MLCEngineInterface | null> => {
    if (!isClientRef.current) return null;
    
    // Prevent concurrent initialization calls
    if (isInitializingRef.current) {
      console.log("[WebLLM] Initialization already in progress — skipping duplicate call");
      return engineRef.current;
    }
    
    if (engineRef.current) {
      // Verify engine is still healthy
      const healthy = await healthCheck();
      if (healthy) return engineRef.current;
      // Engine is unhealthy — reset and re-init
      engineRef.current = null;
    }

    const recovery = recoveryStateRef.current;
    
    // Check max retries
    if (recovery.retryCount >= 5) {
      setState("error");
      setError("Max initialization retries exceeded");
      return null;
    }

    // Exponential backoff wait
    if (recovery.retryCount > 0) {
      const delay = recovery.backoffDelays[recovery.retryCount - 1];
      console.log(`[WebLLM] Retrying in ${delay}ms (attempt ${recovery.retryCount + 1}/5)`);
      setState("recovering");
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Mark as initializing to prevent concurrent calls
    const attemptId = ++initAttemptRef.current;
    isInitializingRef.current = true;

    try {
      setState("initializing");
      setProgress({ text: "Initializing WebLLM...", percentage: 0 });
      setError(null);

      // Dynamic import to prevent SSR bundling
      const webllm = await import("@mlc-ai/web-llm");

      // Check if model is already cached in the browser's Cache API
      // This prevents re-downloading and shows appropriate status
      let isModelCached = false;
      try {
        isModelCached = await webllm.hasModelInCache(selectedModel);
        if (isModelCached) {
          console.log(`[WebLLM] Model "${selectedModel}" found in cache — loading from cache`);
          setProgress({ text: "Loading model from cache...", percentage: 0.1 });
          // Reset retry count since cached models load reliably
          recovery.retryCount = 0;
        } else {
          console.log(`[WebLLM] Model "${selectedModel}" not in cache — will download`);
        }
      } catch (cacheCheckErr) {
        // hasModelInCache may fail in some environments — proceed anyway
        console.warn("[WebLLM] Cache check failed, proceeding with initialization:", cacheCheckErr);
      }

      // Progress callback
      const progressCallback = (report: InitProgressReport) => {
        // Only update if this is still the current initialization attempt
        if (initAttemptRef.current !== attemptId) return;
        
        setProgress({ text: report.text, percentage: report.progress * 100 });
        
        if (report.text.includes("Fetching")) {
          setState("downloading");
        } else if (report.text.includes("Loading")) {
          setState("loading");
        }
        
        if (report.progress >= 1.0) {
          setState("ready");
        }
      };

      // ── Timeout protection ──────────────────────────────────────
      // Prevents CreateWebWorkerMLCEngine from hanging forever and
      // leaving the state stuck at "initializing". If the engine
      // doesn't initialize within ENGINE_INIT_TIMEOUT_MS, we abort
      // and transition back to "idle" so the UI shows "WebGPU Available".
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
      const timeoutPromise = new Promise<null>((resolve) => {
        initTimeoutRef.current = setTimeout(() => {
          console.warn(`[WebLLM] Engine initialization timed out after ${ENGINE_INIT_TIMEOUT_MS / 1000}s`);
          // Only update state if this is still the current attempt
          if (initAttemptRef.current === attemptId) {
            isInitializingRef.current = false;
            setState("idle");
            setError(`Model loading timed out (${ENGINE_INIT_TIMEOUT_MS / 1000}s). Click retry or select a different model.`);
          }
          resolve(null);
        }, ENGINE_INIT_TIMEOUT_MS);
      });

      // Create engine in a Web Worker (keeps UI thread smooth)
      const enginePromise = webllm.CreateWebWorkerMLCEngine(
        new Worker(new URL("@mlc-ai/web-llm", import.meta.url), {
          type: "module",
        }),
        selectedModel,
        {
          initProgressCallback: progressCallback,
        }
      );

      // Race between engine creation and timeout
      const engine = await Promise.race([enginePromise, timeoutPromise]);

      // Clear timeout
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }

      // If timeout won the race, engine is null
      if (!engine) {
        return null;
      }

      // Only update if this is still the current attempt
      if (initAttemptRef.current !== attemptId) {
        console.log("[WebLLM] Stale initialization attempt completed — discarding engine");
        return null;
      }

      engineRef.current = engine;
      recovery.retryCount = 0; // Reset on success
      isInitializingRef.current = false;
      setState("ready");
      setError(null);
      console.log("[WebLLM] Engine initialized successfully");
      return engine;
    } catch (err: any) {
      isInitializingRef.current = false;
      
      // Clear timeout
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      
      // Only update if this is still the current attempt
      if (initAttemptRef.current !== attemptId) {
        return null;
      }
      
      recovery.retryCount += 1;
      recovery.lastRetryTime = Date.now();
      
      console.error(`[WebLLM] Initialization failed (attempt ${recovery.retryCount}/5):`, err);
      
      if (recovery.retryCount >= 5) {
        setState("error");
        setError(err.message || "Failed to initialize WebLLM after 5 attempts");
      } else {
        // Transition to "idle" instead of "recovering" so the UI shows
        // "WebGPU Available" and the user can see the system is still
        // functional. Auto-retry will transition through "recovering" → "initializing".
        setState("idle");
        setError(null);
        // Auto-retry with backoff
        const nextDelay = recovery.backoffDelays[recovery.retryCount - 1];
        setTimeout(() => initEngine(), nextDelay);
      }
      
      return null;
    }
  }, [selectedModel, healthCheck]);

  /**
   * Generate a burst of 3-5 Arabic words.
   * 
   * CRITICAL: This function only works when the engine is already loaded.
   * It does NOT call initEngine() — the engine must be initialized
   * separately (via auto-init or manual loadModel()).
   * 
   * Previously, generateBurst() called initEngine() on first use
   * (lazy initialization). This caused:
   * 1. State stuck at "initializing" if engine creation hangs
   * 2. Cascading React re-renders from state changes during typing
   * 3. Potential interference with Monaco editor input handling
   */
  const generateBurst = useCallback(
    async (source: string, prefix: string): Promise<WebLLMResult> => {
      const engine = engineRef.current;
      
      // CRITICAL: Don't call initEngine() here. The engine must be
      // pre-loaded. If not ready, return empty — the ghost text
      // provider will fall back to LTE/RAG channels.
      if (!engine) {
        return { text: "", aborted: true };
      }

      // Cancel any ongoing generation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const temperature = useSettingsStore.getState().temperature;
      const burstTokens = useSettingsStore.getState().burstTokens;

      try {
        setState("generating");

        // Build the prompt for burst continuation
        const prompt = [
          { role: "system", content: "You are a professional English-to-Arabic translator. Output ONLY the Arabic translation text, nothing else." },
          {
            role: "user",
            content: `Translate this English text to Arabic:\n\n${source}\n\nThe translator has already started typing: "${prefix}"\n\nContinue from where they left off. Output only the remaining Arabic text (no more than ${burstTokens} words).`,
          },
        ];

        // Generate response
        const response = await engine.chat.completions.create({
          messages: prompt as any,
          max_tokens: burstTokens * 3,
          temperature: temperature,
          top_p: 0.9,
          stream: false,
        });

        const text = response.choices[0]?.message?.content?.trim() || "";
        setState("ready");
        
        console.log(`[WebLLM] Burst: "${text.substring(0, 60)}..."`);
        return { text, aborted: false };
      } catch (err: any) {
        if (err.name === "AbortError") {
          return { text: "", aborted: true };
        }
        console.error("[WebLLM] Generation failed:", err);
        
        // Don't nuke the engine on generation failure — it may still work
        // for the next request. Only reset if it's clearly broken.
        setState("ready");
        
        return { text: "", aborted: true };
      }
    },
    [] // No dependencies — uses refs for everything
  );

  /**
   * Full sentence translation with auto-recovery.
   */
  const generateFullTranslation = useCallback(
    async (source: string): Promise<WebLLMResult> => {
      const engine = engineRef.current;
      
      if (!engine) {
        return { text: "", aborted: true };
      }

      // Cancel any ongoing generation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        setState("generating");

        const prompt = [
          { role: "system", content: "You are a professional English-to-Arabic translator. Output ONLY the Arabic translation, nothing else." },
          { role: "user", content: `Translate this text to Arabic:\n\n${source}` },
        ];

        const response = await engine.chat.completions.create({
          messages: prompt as any,
          max_tokens: 256,
          temperature: useSettingsStore.getState().temperature,
          top_p: 0.9,
          stream: false,
        });

        const text = response.choices[0]?.message?.content?.trim() || "";
        setState("ready");
        
        console.log(`[WebLLM] Full: "${text.substring(0, 80)}..."`);
        return { text, aborted: false };
      } catch (err: any) {
        if (err.name === "AbortError") {
          return { text: "", aborted: true };
        }
        console.error("[WebLLM] Full translation failed:", err);
        
        setState("ready");
        return { text: "", aborted: true };
      }
    },
    [] // No dependencies — uses refs for everything
  );

  /**
   * Interrupt any ongoing generation.
   */
  const interruptGenerate = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Use a functional state update to avoid stale closure over `state`
    setState((prev) => prev === "generating" ? "ready" : prev);
  }, []);

  /**
   * Manual retry / model load trigger.
   * Resets retry count and attempts initialization.
   */
  const loadModel = useCallback(async () => {
    engineRef.current = null;
    recoveryStateRef.current.retryCount = 0;
    setError(null);
    await initEngine();
  }, [initEngine]);

  /**
   * Legacy alias for loadModel — backward compat.
   */
  const retry = loadModel;

  // ── Auto-initialize engine when WebGPU is available and model is cached ──
  // This runs once when the state transitions from "unavailable" to "idle".
  // If the model is already in the browser's cache, we load it automatically
  // since it's fast (< 5 seconds). If not cached, we stay at "idle" and
  // let the user trigger model loading from the AI Models view.
  useEffect(() => {
    if (state !== "idle") return;
    if (!isClientRef.current) return;
    if (isInitializingRef.current) return;
    if (engineRef.current) return;

    let cancelled = false;

    const autoInitIfCached = async () => {
      try {
        const webllm = await import("@mlc-ai/web-llm");
        if (cancelled) return;

        const isCached = await webllm.hasModelInCache(selectedModel);
        if (cancelled) return;

        if (isCached) {
          console.log(`[WebLLM] Model "${selectedModel}" is cached — auto-loading`);
          await initEngine();
        } else {
          console.log(`[WebLLM] Model "${selectedModel}" not cached — staying idle (user can load from AI Models view)`);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[WebLLM] Auto-init cache check failed:", err);
          // Stay at "idle" — don't block the UI
        }
      }
    };

    autoInitIfCached();

    return () => {
      cancelled = true;
    };
  }, [state, selectedModel, initEngine]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
      isInitializingRef.current = false;
    };
  }, []);

  return {
    state,
    progress,
    error,
    generateBurst,
    generateFullTranslation,
    interruptGenerate,
    loadModel,
    retry,
    isReady: state === "ready",
    isGenerating: state === "generating",
    /**
     * WebGPU hardware is available (adapter found).
     * Use this to decide whether to SHOW the WebGPU status badge.
     * The ghost text provider should use isReady (not this) to decide
     * whether to call generateBurst().
     */
    isWebGPUAvailable: state !== "unavailable",
  };
}
