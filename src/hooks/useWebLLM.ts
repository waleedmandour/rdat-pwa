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

  const isClient = useSyncExternalStore(subscribeNoop, getIsClient, () => false);

  // Initialize the engine on mount (client-side only)
  useEffect(() => {
    if (!isClient || isInitializingRef.current) return;

    let cancelled = false;
    isInitializingRef.current = true;

    const initEngine = async () => {
      setEngineState("initializing");
      setProgress({ progress: 0, text: "Initializing WebLLM…", timeElapsed: 0 });
      console.log(`[RDAT-LLM] Initializing WebLLM with model: ${LOCAL_MODEL_ID}`);

      try {
        // Dynamic import — keeps the initial bundle small
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
            console.log(`[RDAT-LLM] Progress: ${report.progress.toFixed(0)}% — ${report.text}`);
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
        console.log("[RDAT-LLM] Engine ready — model loaded successfully");
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
   * generate — Send a chat completion request to the local LLM.
   * Returns the generated text string.
   */
  const generate = useCallback(
    async (messages: Array<{ role: string; content: string }>): Promise<string | null> => {
      const engine = engineRef.current;
      if (!engine || engineState !== "ready") {
        console.warn("[RDAT-LLM] generate() called but engine is not ready");
        return null;
      }

      setEngineState("generating");

      try {
        const reply = await engine.chat.completions.create({
          messages,
          temperature: LLM_TEMPERATURE,
          max_tokens: LLM_MAX_TOKENS,
          stream: false,
        });

        const content = reply.choices?.[0]?.message?.content;
        if (content) {
          console.log(`[RDAT-LLM] Generated: "${content.substring(0, 80)}${content.length > 80 ? "…" : ""}"`);
        }
        setEngineState("ready");
        return content || null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[RDAT-LLM] Generation failed: ${msg}`);
        setEngineState("ready"); // Reset to ready even on error
        return null;
      }
    },
    [engineState]
  );

  /**
   * interruptGenerate — Forcefully stop in-flight generation.
   * Critical for the "Latency Trap" — prevents GPU queue backup.
   */
  const interruptGenerate = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    try {
      engine.interruptGenerate();
      console.log("[RDAT-LLM] Generation interrupted — user typed during inference");
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
