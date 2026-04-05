"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { LanguageDirection } from "@/types";
import type { TranslationVersions } from "./usePredictiveTranslation";

// ─── Types ──────────────────────────────────────────────────────────────

export interface BurstContinuationConfig {
  /** Current line text in the TARGET editor (where cursor is) */
  currentTargetLine: string;
  /** Get cached translation versions for a source sentence (from Channel 3) */
  getCachedVersions: (sourceSentence: string) => TranslationVersions | null;
  /** Active source sentence for the current target line */
  activeSourceSentence: string;
  /** Language direction (en-ar or ar-en) */
  languageDirection: LanguageDirection;
  /** WebLLM generate function */
  generate: (messages: Array<{ role: string; content: string }>, max_tokens?: number) => Promise<string | null>;
  /** Whether the LLM engine is ready */
  isLLMReady: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Debounce delay before triggering burst continuation (ms) */
const BURST_DEBOUNCE_MS = 800;

/** Max tokens for 3-5 word burst continuation — intentionally low for speed */
const BURST_MAX_TOKENS = 50;

// ─── Prompt Builder ────────────────────────────────────────────────────

/**
 * buildBurstPrompt — Constructs a minimal prompt for fast 3-5 word completion.
 *
 * Unlike the full dual-version prompt, this is intentionally tiny:
 * - System prompt: 1 sentence
 * - User prompt: 3 lines (cached reference, user draft, instruction)
 *
 * This keeps GPU inference time under 500ms on most hardware.
 */
function buildBurstPrompt(
  cachedTranslation: string,
  userDraft: string,
  languageDirection: LanguageDirection
): Array<{ role: string; content: string }> {
  const targetLang = languageDirection === "en-ar" ? "Arabic" : "English";

  return [
    {
      role: "system",
      content: `You are an expert ${targetLang} translation assistant. Complete the next 3 to 5 words of this translation matching the user's style.`,
    },
    {
      role: "user",
      content: [
        `Full Translation: ${cachedTranslation}`,
        `User's Current Draft: ${userDraft}`,
        `Output: (Only the next 3-5 words)`,
      ].join("\n"),
    },
  ];
}

// ─── Hook ───────────────────────────────────────────────────────────────

/**
 * useBurstContinuation — Channel 5: 3-5 Word Burst Continuation (The Autocomplete).
 *
 * Architecture:
 *   1. Debounces target editor typing by 800ms.
 *   2. On trigger, fetches the pre-translated sentence from Channel 3 cache.
 *   3. If cache hit, sends a fast minimal prompt to WebLLM for next 3-5 words.
 *   4. Stores the result for Channel 1 (registerInlineCompletionsProvider) to consume.
 *
 * WebGPU Safety:
 *   - Uses only 50 max_tokens (vs 200 for full translations).
 *   - If the GPU is busy (isGeneratingRef), the generate() call returns null immediately.
 *   - Does NOT abort the prefetch engine — operates independently.
 *   - Only fires when cache is available (no wasted GPU cycles on cold start).
 */
export function useBurstContinuation(config: BurstContinuationConfig) {
  const {
    currentTargetLine,
    getCachedVersions,
    activeSourceSentence,
    languageDirection,
    generate,
    isLLMReady,
  } = config;

  // ─── State ───────────────────────────────────────────────────────────
  const [burstSuggestion, setBurstSuggestion] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // ─── Refs ────────────────────────────────────────────────────────────
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isGeneratingRef = useRef(false);

  // Store config in refs for async access (avoids stale closures)
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Ref for the burst suggestion (read by inline completions provider)
  const burstSuggestionRef = useRef<string | null>(null);
  useEffect(() => {
    burstSuggestionRef.current = burstSuggestion;
  }, [burstSuggestion]);

  // ─── Generate Burst ──────────────────────────────────────────────────

  const generateBurst = useCallback(async () => {
    // Guard: prevent concurrent generations
    if (isGeneratingRef.current) {
      console.log("[RDAT-Burst] Already generating — skipping");
      return;
    }

    const c = configRef.current;

    // Step 1: Get cached translation from Channel 3
    const sourceSentence = c.activeSourceSentence || "";
    const versions = c.getCachedVersions?.(sourceSentence);

    if (!versions || versions.length < 1) {
      console.log("[RDAT-Burst] No cached translation available — skipping burst");
      return;
    }

    // Use Version 1 (Formal) as the reference translation
    const cachedTranslation = (versions[0] || "").trim();
    if (!cachedTranslation) return;

    // Step 2: Get user's current draft (the line they're typing on)
    const userDraft = (c.currentTargetLine || "").trim();
    if (!userDraft || userDraft.length < 2) {
      console.log("[RDAT-Burst] User draft too short — skipping burst");
      return;
    }

    // Step 3: Check LLM readiness
    if (!c.isLLMReady) {
      console.log("[RDAT-Burst] LLM not ready — skipping burst");
      return;
    }

    // Step 4: Skip if user's draft already matches the full cached translation
    const normalizedDraft = userDraft.replace(/\s+/g, " ").trim();
    const normalizedCached = cachedTranslation.replace(/\s+/g, " ").trim();
    if (normalizedCached.startsWith(normalizedDraft) && normalizedCached.length - normalizedDraft.length < 5) {
      console.log("[RDAT-Burst] User is nearly done — Channel 3 remainder is sufficient");
      return;
    }

    isGeneratingRef.current = true;
    setIsGenerating(true);

    try {
      // Step 5: Build minimal prompt and generate
      const direction = c.languageDirection;
      const messages = buildBurstPrompt(cachedTranslation, userDraft, direction);

      console.log(
        `[RDAT-Burst] Generating 3-5 word continuation...`,
        `\n  Source: "${sourceSentence.substring(0, 50)}${sourceSentence.length > 50 ? "…" : ""}"`,
        `\n  Cached: "${cachedTranslation.substring(0, 60)}${cachedTranslation.length > 60 ? "…" : ""}"`,
        `\n  Draft: "${userDraft.substring(0, 60)}${userDraft.length > 60 ? "…" : ""}"`
      );

      const result = await c.generate(messages, BURST_MAX_TOKENS);

      if (result && result.trim()) {
        // Clean the result: strip markdown, quotes, numbered prefixes
        let cleaned = result.trim();

        // Remove surrounding quotes (Arabic/English)
        cleaned = cleaned.replace(/^["'\u00AB\u201C]|["'\u00BB\u201D]$/g, "");

        // Remove numbered/list prefixes that some LLMs add
        cleaned = cleaned.replace(/^\d+[\.\)]\s*/, "");

        // Remove "Output:" prefix
        cleaned = cleaned.replace(/^Output\s*:\s*/i, "");

        cleaned = cleaned.trim();

        if (cleaned && cleaned.length > 0) {
          setBurstSuggestion(cleaned);
          console.log("[RDAT-Burst] ✓ Generated burst:", `"${cleaned}"`);
        }
      } else {
        console.log("[RDAT-Burst] LLM returned empty — no burst available");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[RDAT-Burst] Generation failed:", msg);
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  }, []);

  // ─── Debounce on currentTargetLine changes ────────────────────────────

  useEffect(() => {
    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Clear burst suggestion when user types (stale suggestion)
    setBurstSuggestion(null);

    // Don't trigger if no content
    if (!currentTargetLine || !currentTargetLine.trim()) return;

    // Debounce: wait 800ms after user stops typing
    debounceTimerRef.current = setTimeout(() => {
      generateBurst();
    }, BURST_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [currentTargetLine, generateBurst]);

  // ─── Cleanup ─────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  // ─── Return ──────────────────────────────────────────────────────────

  return {
    /** The burst suggestion text (null if not available) */
    burstSuggestion,
    /** Ref to burst suggestion for use inside inline completions provider (avoids re-registration) */
    burstSuggestionRef,
    /** Whether the burst engine is currently generating */
    isBurstGenerating: isGenerating,
    /** Manually clear the burst suggestion */
    clearBurst: useCallback(() => setBurstSuggestion(null), []),
  };
}
