"use client";

import { useState, useRef, useCallback } from "react";
import type { InferenceState } from "@/types";
import {
  DEBOUNCE_DELAY_MS,
  MOCK_INFERENCE_DELAY_MS,
} from "@/lib/constants";

/**
 * useEditorEventLoop — The core "Latency Trap" management hook.
 *
 * Every keystroke from the Monaco editor flows through this hook.
 * It implements a debounce → abort → re-trigger cycle:
 *
 *   1. User types → clear debounce timer
 *   2. If inference is running → abort it immediately (AbortController)
 *   3. Start new debounce countdown (300ms)
 *   4. On debounce fire → begin mock inference (1500ms simulated delay)
 *   5. If user types during step 4 → goto step 2
 *
 * All timers, AbortControllers, and listeners are cleaned up on unmount.
 */
export function useEditorEventLoop() {
  const [inferenceState, setInferenceState] =
    useState<InferenceState>("idle");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inferenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Internal: runs the mock inference after the debounce settles.
   * Creates a new AbortController for this inference cycle.
   */
  const runMockInference = useCallback(
    (text: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const signal = controller.signal;

      setInferenceState("running");
      console.log(
        `[RDAT] Mock inference started — text preview: "${text.substring(0, 50)}${text.length > 50 ? "…" : ""}"`
      );

      inferenceTimerRef.current = setTimeout(() => {
        if (signal.aborted) return;

        setInferenceState("completed");
        console.log(
          `[RDAT] Mock inference completed — text preview: "${text.substring(0, 50)}${text.length > 50 ? "…" : ""}"`
        );

        // Reset to idle after a brief visual feedback window
        completionResetRef.current = setTimeout(() => {
          if (!signal.aborted) {
            setInferenceState("idle");
          }
        }, 400);
      }, MOCK_INFERENCE_DELAY_MS);

      // Listen for abort — clean up the inference timer
      signal.addEventListener(
        "abort",
        () => {
          if (inferenceTimerRef.current) {
            clearTimeout(inferenceTimerRef.current);
            inferenceTimerRef.current = null;
          }
          if (completionResetRef.current) {
            clearTimeout(completionResetRef.current);
            completionResetRef.current = null;
          }
        },
        { once: true }
      );
    },
    []
  );

  /**
   * Called on every Monaco onChange event.
   * Clears debounce, aborts running inference, starts new cycle.
   */
  const handleEditorChange = useCallback(
    (value: string) => {
      // ── 1. Clear existing debounce timer ──
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      // ── 2. Abort any in-flight inference ──
      if (
        abortRef.current !== null &&
        !abortRef.current.signal.aborted
      ) {
        abortRef.current.abort();
        console.log("[RDAT] Inference Aborted due to new keystroke");
        // State update is deferred — the debounce will set "running" shortly
      }

      // ── 3. Debounce, then fire inference ──
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        runMockInference(value);
      }, DEBOUNCE_DELAY_MS);
    },
    [runMockInference]
  );

  /**
   * Manual cleanup for all active timers and controllers.
   * Called on unmount and can be called programmatically.
   */
  const cleanup = useCallback(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (inferenceTimerRef.current !== null) {
      clearTimeout(inferenceTimerRef.current);
      inferenceTimerRef.current = null;
    }
    if (completionResetRef.current !== null) {
      clearTimeout(completionResetRef.current);
      completionResetRef.current = null;
    }
    if (abortRef.current !== null && !abortRef.current.signal.aborted) {
      abortRef.current.abort();
    }
    setInferenceState("idle");
  }, []);

  return {
    inferenceState,
    handleEditorChange,
    cleanup,
  };
}
