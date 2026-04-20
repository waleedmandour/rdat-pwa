"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { MLCEngineInterface, InitProgressReport } from "@mlc-ai/web-llm";
import { useSettingsStore } from "@/stores/settings-store";

export type WebLLMState = 
  | "unavailable"
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

/**
 * useWebLLM — WebGPU Neural Network with Exponential Backoff Recovery.
 * 
 * Features:
 *  - Exponential backoff on initialization failure (1s → 30s)
 *  - Health check to verify engine still works
 *  - Auto-recovery on generation failure
 *  - Max 5 retries before giving up
 *  - Proper cleanup on unmount
 */
export function useWebLLM() {
  const [state, setState] = useState<WebLLMState>("unavailable");
  const [progress, setProgress] = useState<WebLLMProgress>({ text: "", percentage: 0 });
  const [error, setError] = useState<string | null>(null);
  
  const engineRef = useRef<MLCEngineInterface | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isClientRef = useRef(false);
  
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
        // WebGPU is available, engine will initialize on first use
        setState("initializing");
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
   */
  const initEngine = useCallback(async () => {
    if (!isClientRef.current) return null;
    if (engineRef.current) {
      // Verify engine is still healthy
      const healthy = await healthCheck();
      if (healthy) return engineRef.current;
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

    try {
      setState("initializing");
      setProgress({ text: "Initializing WebLLM...", percentage: 0 });
      setError(null);

      // Dynamic import to prevent SSR bundling
      const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");

      // Progress callback
      const progressCallback = (report: InitProgressReport) => {
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

      // Create engine in a Web Worker (keeps UI thread smooth)
      const engine = await CreateWebWorkerMLCEngine(
        new Worker(new URL("@mlc-ai/web-llm", import.meta.url), {
          type: "module",
        }),
        selectedModel,
        {
          initProgressCallback: progressCallback,
        }
      );

      engineRef.current = engine;
      recovery.retryCount = 0; // Reset on success
      setState("ready");
      console.log("[WebLLM] Engine initialized successfully");
      return engine;
    } catch (err: any) {
      recovery.retryCount += 1;
      recovery.lastRetryTime = Date.now();
      
      console.error(`[WebLLM] Initialization failed (attempt ${recovery.retryCount}/5):`, err);
      
      if (recovery.retryCount >= 5) {
        setState("error");
        setError(err.message || "Failed to initialize WebLLM after 5 attempts");
      } else {
        setState("recovering");
        // Auto-retry
        const nextDelay = recovery.backoffDelays[recovery.retryCount - 1];
        setTimeout(() => initEngine(), nextDelay);
      }
      
      return null;
    }
  }, [selectedModel, healthCheck]);

  /**
   * Generate a burst of 3-5 Arabic words with auto-recovery.
   */
  const generateBurst = useCallback(
    async (source: string, prefix: string): Promise<WebLLMResult> => {
      let engine = engineRef.current;
      
      if (!engine) {
        engine = await initEngine();
        if (!engine) {
          return { text: "", aborted: true };
        }
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
        console.error("[WebLLM] Generation failed, attempting recovery:", err);
        
        // Auto-recovery: reset engine and retry
        engineRef.current = null;
        setState("recovering");
        
        // Don't retry immediately if we just retried initialization
        if (Date.now() - recoveryStateRef.current.lastRetryTime > 5000) {
          const retryEngine = await initEngine();
          if (retryEngine) {
            // Don't retry the same generation, just fail gracefully
            setState("error");
            setError("Generation failed, please try again");
          }
        }
        
        return { text: "", aborted: true };
      }
    },
    [initEngine]
  );

  /**
   * Full sentence translation with auto-recovery.
   */
  const generateFullTranslation = useCallback(
    async (source: string): Promise<WebLLMResult> => {
      let engine = engineRef.current;
      
      if (!engine) {
        engine = await initEngine();
        if (!engine) {
          return { text: "", aborted: true };
        }
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
        console.error("[WebLLM] Full translation failed, attempting recovery:", err);
        
        // Auto-recovery
        engineRef.current = null;
        setState("recovering");
        
        if (Date.now() - recoveryStateRef.current.lastRetryTime > 5000) {
          const retryEngine = await initEngine();
          if (retryEngine) {
            setState("error");
            setError("Full translation failed, please try again");
          }
        }
        
        return { text: "", aborted: true };
      }
    },
    [initEngine]
  );

  /**
   * Interrupt any ongoing generation.
   */
  const interruptGenerate = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (state === "generating") {
      setState("ready");
    }
  }, [state]);

  /**
   * Manual retry trigger.
   */
  const retry = useCallback(async () => {
    engineRef.current = null;
    recoveryStateRef.current.retryCount = 0;
    await initEngine();
  }, [initEngine]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    state,
    progress,
    error,
    generateBurst,
    generateFullTranslation,
    interruptGenerate,
    retry,
    isReady: state === "ready",
    isGenerating: state === "generating",
  };
}
