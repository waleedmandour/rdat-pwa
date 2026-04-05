"use client";

import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import type { WebLLMState, WebLLMProgress } from "@/types";
import { LOCAL_MODEL_ID, LOCAL_MODEL_INIT_TIMEOUT_MS, LLM_MAX_TOKENS, LLM_TEMPERATURE } from "@/lib/constants";

// Hydration-safe client detection
const getIsClient = () => true;
const subscribeNoop = () => () => {};

export function useWebLLM() {
  const [engineState, setEngineState] = useState<WebLLMState>("idle");
  const [progress, setProgress] = useState<WebLLMProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // MLCEngineInterface from @mlc-ai/web-llm has no stable exported type
  const engineRef = useRef<any>(null);
  const isInitializingRef = useRef(false);
  const isGeneratingRef = useRef(false);

  const isClient = useSyncExternalStore(subscribeNoop, getIsClient, () => false);

  // Initialize the engine on mount (client-side only)
  useEffect(() => {
    if (!isClient || isInitializingRef.current) return;

    let cancelled = false;
    isInitializingRef.current = true;

    const initEngine = async () => {
      setEngineState("initializing");
      setProgress({ progress: 0, text: "Initializing WebLLM\u2026", timeElapsed: 0 });
      console.log(`[RDAT-LLM] Initializing WebLLM with model: ${LOCAL_MODEL_ID}`);

      try {
        // Dynamic import - keeps the initial bundle small
        const { CreateMLCEngine } = await import("@mlc-ai/web-llm");

        if (cancelled) return;

        const initTimeout = setTimeout(() => {
          if (!cancelled) {
            console.error("[RDAT-LLM] Model initialization timed out");
            setEngineState("error");
            setErrorMessage("Model loading timed out. Please try again.");
            isInitializingRef.current = false;
          }
        }, LOCAL_MODEL_INIT_TIMEOUT_MS);

        const engine = await CreateMLCEngine(LOCAL_MODEL_ID, {
          initProgressCallback: (report) => {
            if (cancelled) return;
            console.log(`[RDAT-LLM] Progress: ${report.progress.toFixed(0)}% \u2014 ${report.text}`);
            setProgress({
              progress: report.progress,
              text: report.text,
              timeElapsed: report.timeElapsed,
            });
          },
        });

        clearTimeout(initTimeout);

        if (cancelled) {
          // Unload if we were cancelled during init
          await engine.unload().catch(() => {});
          return;
        }

        engineRef.current = engine;
        setEngineState("ready");
        setErrorMessage(null);
        console.log("[RDAT-LLM] Engine ready \u2014 model loaded successfully");
        isInitializingRef.current = false;
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[RDAT-LLM] Initialization failed: ${msg}`);
        setEngineState("error");
        setErrorMessage(msg);
        isInitializingRef.current = false;
      }
    };

    initEngine();

    return () => {
      cancelled = true;
      // Unload the engine on unmount to free GPU resources
      if (engineRef.current) {
        console.log("[RDAT-LLM] Unloading engine on unmount");
        engineRef.current.unload().catch(() => {});
        engineRef.current = null;
      }
    };
  }, [isClient]);

  /**
   * generate - Send a chat completion request to the local LLM.
   * Returns the generated text string.
   *
   * @param messages - Chat messages to send to the LLM
   * @param max_tokens - Optional override for max tokens (defaults to LLM_MAX_TOKENS)
   */
  const generate = useCallback(
    async (messages: Array<{ role: string; content: string }>, max_tokens?: number): Promise<string | null> => {
      const engine = engineRef.current;
      if (!engine || engineState !== "ready") {
        console.warn("[RDAT-LLM] generate() called but engine is not ready");
        return null;
      }

      // Guard: if already generating, return null immediately (don't queue GPU requests)
      if (isGeneratingRef.current) {
        console.warn("[RDAT-LLM] generate() called while already generating - skipping");
        return null;
      }

      isGeneratingRef.current = true;
      setEngineState("generating");

      try {
        const reply = await engine.chat.completions.create({
          messages,
          temperature: LLM_TEMPERATURE,
          max_tokens: max_tokens ?? LLM_MAX_TOKENS,
          stream: false,
        });

        const content = reply.choices?.[0]?.message?.content;
        if (content) {
          const safeContent = String(content ?? "");
          console.log(`[RDAT-LLM] Generated: "${safeContent.substring(0, 80)}${(safeContent?.length ?? 0) > 80 ? "\u2026" : ""}"`);
        }
        isGeneratingRef.current = false;
        setEngineState("ready");
        return content || null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[RDAT-LLM] Generation failed: ${msg}`);
        isGeneratingRef.current = false;
        setEngineState("ready"); // Reset to ready even on error
        return null;
      }
    },
    [engineState]
  );

  /**
   * interruptGenerate - Forcefully stop in-flight generation.
   * Critical for the "Latency Trap" - prevents GPU queue backup.
   */
  const interruptGenerate = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    try {
      isGeneratingRef.current = false;
      engine.interruptGenerate();
      console.log("[RDAT-LLM] Generation interrupted - user typed during inference");
      setEngineState("ready");
    } catch (err) {
      console.error("[RDAT-LLM] Interrupt failed:", err);
    }
  }, []);

  return {
    engineState,
    progress,
    errorMessage,
    generate,
    interruptGenerate,
    isReady: engineState === "ready",
    isInitializing: engineState === "initializing",
    isGenerating: engineState === "generating",
    hasError: engineState === "error",
  };
}
