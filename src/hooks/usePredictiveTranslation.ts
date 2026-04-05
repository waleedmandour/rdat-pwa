"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { LanguageDirection } from "@/types";
import type { RAGResult } from "@/lib/rag-types";
import { LLM_MAX_TOKENS, LLM_TEMPERATURE } from "@/lib/constants";

// ─── Types ──────────────────────────────────────────────────────────────

/** A cached translation entry: [Formal/Literal, Natural/Standard] */
export type TranslationVersions = [string, string];

/** Cache map: sourceSentence → [Version1, Version2] */
export type TranslationCache = Map<string, TranslationVersions>;

export interface PredictiveTranslationConfig {
  /** The active source sentence to prefetch translations for */
  activeSourceSentence: string;
  /** Language direction (en-ar or ar-en) */
  languageDirection: LanguageDirection;
  /** WebLLM generate function */
  generate: (messages: Array<{ role: string; content: string }>) => Promise<string | null>;
  /** WebLLM interrupt function */
  interruptGenerate: () => void;
  /** Whether the LLM engine is ready */
  isLLMReady: boolean;
  /** RAG search function */
  ragSearch: (query: string) => Promise<RAGResult[]>;
  /** RAG results from the latest search */
  ragResults: RAGResult[];
  /** Whether RAG is ready */
  isRAGReady: boolean;
}

export interface PredictiveTranslationState {
  /** The translation cache */
  cache: TranslationCache;
  /** Whether a prefetch is currently running */
  isPrefetching: boolean;
  /** The last error message, if any */
  error: string | null;
  /** The source sentence currently being prefetched */
  prefetchingSentence: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Delimiter used in the LLM prompt/response to separate two versions */
const VERSION_DELIMITER = "|||";

/** Maximum tokens for the dual-version generation (needs more than single ghost text) */
const PREFETCH_MAX_TOKENS = 120;

/** Debounce delay before triggering a new prefetch (ms) */
const PREFETCH_DEBOUNCE_MS = 400;

// ─── Prompt Builders ───────────────────────────────────────────────────

function buildDualVersionPrompt(
  sourceSentence: string,
  direction: LanguageDirection,
  ragResults: RAGResult[]
): Array<{ role: string; content: string }> {
  const isForward = direction === "en-ar";
  const sourceLang = isForward ? "English" : "Arabic";
  const targetLang = isForward ? "Arabic" : "English";

  const systemPrompt = `You are an expert ${sourceLang}-${targetLang} translation assistant. Your task is to translate the given source text and provide exactly 2 distinct versions.

CRITICAL RULES:
1. You MUST output exactly 2 translation versions separated by "${VERSION_DELIMITER}".
2. Version 1: Formal/Literal translation — faithful, precise, formal register.
3. Version 2: Natural/Standard translation — fluent, idiomatic, natural register.
4. Output ONLY the two versions separated by "${VERSION_DELIMITER}". No commentary, no explanation, no markdown.
5. Each version should be a COMPLETE translation of the source sentence (not just the next few words).
6. Do not output the source text, only the translations.
7. Do not wrap in quotes or add any formatting.`;

  let userMessage = `Translate the following ${sourceLang} text into ${targetLang}. Provide exactly 2 versions separated by "${VERSION_DELIMITER}". Version 1: Formal/Literal. Version 2: Natural/Standard.\n\nSource Text (${sourceLang}):\n${sourceSentence}`;

  // Add RAG context if available
  if (ragResults && (ragResults?.length ?? 0) > 0) {
    const tmEntries = (ragResults ?? [])
      .map((r, i) => {
        const src = isForward ? r.en : r.ar;
        const tgt = isForward ? r.ar : r.en;
        return `${i + 1}. "${src}" → "${tgt}"`;
      })
      .join("\n");

    userMessage += `\n\nReference Translation Memory:\n${tmEntries}`;
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];
}

// ─── Hook ───────────────────────────────────────────────────────────────

export function usePredictiveTranslation(config: PredictiveTranslationConfig) {
  const {
    activeSourceSentence,
    languageDirection,
    generate,
    interruptGenerate,
    isLLMReady,
    ragSearch,
    ragResults,
    isRAGReady,
  } = config;

  // ─── State ───────────────────────────────────────────────────────────
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefetchingSentence, setPrefetchingSentence] = useState<string | null>(null);

  // Use a ref for the cache so we don't trigger re-renders on every cache update
  const cacheRef = useRef<TranslationCache>(new Map());
  // Increment to force re-render when cache changes
  const [cacheVersion, setCacheVersion] = useState(0);

  // Abort controller ref for cancelling in-flight prefetches
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store the latest config in refs for the async callback
  const generateRef = useRef(generate);
  const interruptRef = useRef(interruptGenerate);
  const ragSearchRef = useRef(ragSearch);
  const isLLMReadyRef = useRef(isLLMReady);
  const languageDirectionRef = useRef(languageDirection);
  const ragResultsRef = useRef(ragResults);
  const isRAGReadyRef = useRef(isRAGReady);

  useEffect(() => { generateRef.current = generate; }, [generate]);
  useEffect(() => { interruptRef.current = interruptGenerate; }, [interruptGenerate]);
  useEffect(() => { ragSearchRef.current = ragSearch; }, [ragSearch]);
  useEffect(() => { isLLMReadyRef.current = isLLMReady; }, [isLLMReady]);
  useEffect(() => { languageDirectionRef.current = languageDirection; }, [languageDirection]);
  useEffect(() => { ragResultsRef.current = ragResults; }, [ragResults]);
  useEffect(() => { isRAGReadyRef.current = isRAGReady; }, [isRAGReady]);

  /**
   * prefetchTranslation — Background generation of dual-version translations.
   * Aborts any in-flight generation before starting a new one.
   */
  const prefetchTranslation = useCallback(
    async (sourceSentence: string) => {
      const safeSentence = String(sourceSentence ?? "");
      if (!safeSentence || safeSentence.trim().length < 3) return;
      if (!isLLMReadyRef.current) {
        console.log("[RDAT-Prefetch] LLM not ready — skipping prefetch");
        return;
      }

      // Check cache first
      if (cacheRef.current.has(safeSentence)) {
        console.log("[RDAT-Prefetch] Cache hit for:", (safeSentence ?? "").substring(0, 60));
        return;
      }

      // Abort any previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        interruptRef.current();
        console.log("[RDAT-Prefetch] Aborted previous in-flight generation");
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsPrefetching(true);
      setError(null);
      setPrefetchingSentence(safeSentence);

      try {
        // Perform RAG search if available and not already cached
        let currentRagResults: RAGResult[] = ragResultsRef.current ?? [];
        if (isRAGReadyRef.current && (currentRagResults?.length ?? 0) === 0) {
          try {
            currentRagResults = await ragSearchRef.current?.(safeSentence) ?? [];
          } catch {
            // RAG search failed — proceed without it
            console.log("[RDAT-Prefetch] RAG search failed — proceeding without context");
          }
        }

        if (abortController.signal.aborted) return;

        // Build prompt and generate
        const direction = languageDirectionRef.current;
        const messages = buildDualVersionPrompt(safeSentence, direction, currentRagResults);

        console.log(
          `[RDAT Debug] Requesting translation for: "${(safeSentence ?? "").substring(0, 60)}${(safeSentence?.length ?? 0) > 60 ? "…" : ""}"`
        );
        console.log("[RDAT Debug] Language direction:", direction);
        console.log("[RDAT Debug] RAG context entries:", (currentRagResults?.length ?? 0));
        console.log("[RDAT Debug] Prompt messages:", messages.map((m) => ({ role: m.role, contentLen: m.content.length })));

        // Note: We call the generate function directly. The generate function from
        // useWebLLM uses LLM_MAX_TOKENS internally, but for prefetch we need more tokens.
        // We'll work with what we get and parse accordingly.
        console.log("[RDAT Debug] Calling LLM generate...");
        const result = await generateRef.current?.(messages) ?? null;
        console.log("[RDAT Debug] Engine responded with:", result ? `"${(result ?? "").substring(0, 120)}${(result?.length ?? 0) > 120 ? "…" : ""}"` : "null/empty");

        if (abortController.signal.aborted) return;

        if (result && result.trim()) {
          const parsed = parseDualVersionResponse(result.trim());
          if (parsed && parsed.length >= 2) {
            cacheRef.current.set(safeSentence, parsed);
            setCacheVersion((v) => v + 1);
            console.log(
              `[RDAT-Prefetch] Cached ${parsed.length} versions for: "${(safeSentence ?? "").substring(0, 60)}"`,
              parsed.map((v: string) => `"${String(v ?? "").substring(0, 40)}${(v?.length ?? 0) > 40 ? "…" : ""}"`)
            );
          } else {
            console.log("[RDAT-Prefetch] Could not parse dual versions from LLM output:", (result ?? "").substring(0, 100));
            // Store the single result as both versions as fallback
            cacheRef.current.set(safeSentence, [result.trim(), result.trim()]);
            setCacheVersion((v) => v + 1);
          }
        } else {
          console.log("[RDAT-Prefetch] LLM returned null/empty");
        }
      } catch (err) {
        if (abortController.signal.aborted) {
          console.log("[RDAT-Prefetch] Prefetch aborted — user typed or source changed");
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[RDAT-Prefetch] Prefetch failed:", msg);
          setError(msg);
        }
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
          setIsPrefetching(false);
          setPrefetchingSentence(null);
        }
      }
    },
    []
  );

  /**
   * interruptPrefetch — Forcefully cancel the current prefetch to free GPU.
   * Called when the user starts typing to ensure 0ms latency.
   */
  const interruptPrefetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    interruptRef.current();
    setIsPrefetching(false);
    setPrefetchingSentence(null);
  }, []);

  /**
   * getCachedVersions — Get cached translation versions for a source sentence.
   */
  const getCachedVersions = useCallback(
    (sourceSentence: string): TranslationVersions | null => {
      return cacheRef.current.get(sourceSentence) ?? null;
    },
    [cacheVersion]
  );

  /**
   * clearCache — Clear the entire translation cache.
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
    setCacheVersion((v) => v + 1);
    console.log("[RDAT-Prefetch] Cache cleared");
  }, []);

  // ─── Trigger prefetch when activeSourceSentence changes ─────────────
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const safeSentence = String(activeSourceSentence ?? "");
    if (!safeSentence || safeSentence.trim().length < 3) return;

    debounceTimerRef.current = setTimeout(() => {
      prefetchTranslation(safeSentence);
    }, PREFETCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [activeSourceSentence, isLLMReady, prefetchTranslation]);

  // ─── Cleanup on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      interruptRef.current();
    };
  }, []);

  return {
    cache: cacheRef.current,
    cacheVersion,
    isPrefetching,
    error,
    prefetchingSentence,
    prefetchTranslation,
    interruptPrefetch,
    getCachedVersions,
    clearCache,
  };
}

// ─── Parser ─────────────────────────────────────────────────────────────

/**
 * parseDualVersionResponse — Parses the LLM output to extract two translation versions.
 *
 * Handles various formats:
 * 1. "Version1 ||| Version2" (standard delimiter)
 * 2. "Version1|||Version2" (no spaces around delimiter)
 * 3. Numbered: "1. Version1 ||| 2. Version2"
 * 4. Labeled: "Formal: Version1 ||| Natural: Version2"
 * 5. Newline-separated fallback
 */
function parseDualVersionResponse(raw: string): TranslationVersions | null {
  // Try standard delimiter first
  const safeRaw = String(raw ?? "");
  if (safeRaw.includes(VERSION_DELIMITER)) {
    const parts = safeRaw.split(VERSION_DELIMITER).map((s) => String(s ?? "").trim());
    if ((parts?.length ?? 0) >= 2) {
      const v1 = cleanVersion(parts[0]);
      const v2 = cleanVersion(parts[1]);
      if (v1 && v2 && (v1?.length ?? 0) > 0 && (v2?.length ?? 0) > 0) {
        return [v1, v2];
      }
    }
  }

  // Try newline-based separation (some LLMs output versions on separate lines)
  const lines = safeRaw.split("\n").map((l) => String(l ?? "").trim()).filter((l) => (l ?? "").length > 0);
  if ((lines?.length ?? 0) >= 2) {
    const v1 = cleanVersion(lines[0]);
    const v2 = cleanVersion(lines[1]);
    if (v1 && v2 && (v1?.length ?? 0) > 0 && (v2?.length ?? 0) > 0) {
      return [v1, v2];
    }
  }

  // Could not parse two versions — return null
  return null;
}

/**
 * cleanVersion — Removes common prefixes from a version string.
 * Strips patterns like "1.", "2.", "Version 1:", "Formal:", "Natural:", etc.
 */
function cleanVersion(raw: string | null | undefined): string {
  let cleaned = (raw ?? "").trim();

  // Remove numbered prefixes: "1.", "2.", "1)", "2)"
  cleaned = cleaned.replace(/^\d+[\.\)]\s*/, "");

  // Remove labeled prefixes: "Version 1:", "Version 2:", "Formal:", "Natural:", etc.
  cleaned = cleaned.replace(
    /^(Version\s*\d+\s*:|Formal\s*:|Literal\s*:|Natural\s*:|Standard\s*:)\s*/i,
    ""
  );

  // Remove surrounding quotes
  cleaned = cleaned.replace(/^["'«]|["'»]$/g, "");

  return cleaned.trim();
}
