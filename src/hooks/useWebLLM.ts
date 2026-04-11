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
  | "error";

interface WebLLMProgress {
  text: string;
  percentage: number;
}

interface WebLLMResult {
  text: string;
  aborted: boolean;
}

/**
 * useWebLLM — WebGPU Neural Network Integration.
 * 
 * Uses CreateWebWorkerMLCEngine to keep the main UI thread smooth.
 * Model: gemma-2b-it-q4f32_1-MLC (fast, quantized, ~1.5GB download).
 * 
 * Features:
 *  - interruptGenerate() cancels on new keystrokes
 *  - generateBurst() for 3-5 word completions
 *  - Progress tracking for download/loading UI
 *  - Strictly client-side only (SSR safe)
 */
export function useWebLLM() {
  const [state, setState] = useState<WebLLMState>("unavailable");
  const [progress, setProgress] = useState<WebLLMProgress>({ text: "", percentage: 0 });
  const [error, setError] = useState<string | null>(null);
  
  const engineRef = useRef<MLCEngineInterface | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isClientRef = useRef(false);
  
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

  // Initialize the engine lazily (first call to generate)
  const initEngine = useCallback(async () => {
    if (!isClientRef.current) return null;
    if (engineRef.current) return engineRef.current;

    try {
      setState("initializing");
      setProgress({ text: "Initializing WebLLM...", percentage: 0 });

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
      setState("ready");
      console.log("[WebLLM] Engine initialized successfully");
      return engine;
    } catch (err: any) {
      console.error("[WebLLM] Initialization failed:", err);
      setState("error");
      setError(err.message || "Failed to initialize WebLLM");
      return null;
    }
  }, [selectedModel]);

  /**
   * Generate a burst of 3-5 Arabic words.
   * 
   * Prompt: "Translate the source to Arabic. Continue from the prefix.
   *          Output ONLY the next 3 to 5 words."
   * Config: max_tokens: 10, temperature: 0.3
   */
  const generateBurst = useCallback(
    async (source: string, prefix: string): Promise<WebLLMResult> => {
      const engine = engineRef.current || await initEngine();
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
          max_tokens: burstTokens * 3, // ~3 tokens per word
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
        setState("error");
        setError(err.message);
        return { text: "", aborted: true };
      }
    },
    [initEngine]
  );

  /**
   * Full sentence translation (for 1200ms pause completion).
   */
  const generateFullTranslation = useCallback(
    async (source: string): Promise<WebLLMResult> => {
      const engine = engineRef.current || await initEngine();
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
        setState("error");
        setError(err.message);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Don't destroy engine on unmount — it's expensive to reinitialize
    };
  }, []);

  return {
    state,
    progress,
    error,
    generateBurst,
    generateFullTranslation,
    interruptGenerate,
    isReady: state === "ready",
    isGenerating: state === "generating",
  };
}
