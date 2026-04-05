"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { LanguageDirection } from "@/types";
import type { RAGResult } from "@/lib/rag-types";
import { LLM_MAX_TOKENS } from "@/lib/constants";

// ─── Types ──────────────────────────────────────────────────────────────

/** A cached translation entry: [Formal/Literal, Natural/Standard] */
export type TranslationVersions = [string, string];

/** Cache map: sourceSentence → [Version1, Version2] */
export type TranslationCache = Map<string, TranslationVersions>;

/** A sentence extracted from the source text */
export interface SourceSentence {
  lineNumber: number;
  text: string;
}

export interface PredictiveTranslationConfig {
  /** FULL source document text (not just one sentence) */
  sourceText: string;
  /** Current line number in target editor (1-based) */
  activeTargetLine: number;
  /** Language direction (en-ar or ar-en) */
  languageDirection: LanguageDirection;
  /** WebLLM generate function (now accepts optional max_tokens) */
  generate: (messages: Array<{ role: string; content: string }>, max_tokens?: number) => Promise<string | null>;
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

// ─── Constants ──────────────────────────────────────────────────────────

/** Delimiter used in the LLM prompt/response to separate two versions */
const VERSION_DELIMITER = "|||";

/** Debounce delay before triggering a new prefetch cycle (ms) */
const PREFETCH_DEBOUNCE_MS = 400;

/** Max tokens for full sentence dual-version translations */
const DUAL_VERSION_MAX_TOKENS = 200;

/** Max sentences to prefetch ahead (N+3 window, minus 1 lookback) */
const PREFETCH_WINDOW_AHEAD = 3;
const PREFETCH_WINDOW_BEHIND = 1;

// ─── Sentence Splitter ─────────────────────────────────────────────────

/**
 * splitSourceIntoSentences — Splits the source text into an array of
 * { lineNumber, text } objects. Each non-empty line becomes a sentence.
 * Lines are joined at `.!?` boundaries to form complete sentences.
 *
 * @param sourceText The full source document text
 * @returns Array of SourceSentence objects
 */
function splitSourceIntoSentences(sourceText: string): SourceSentence[] {
  if (!sourceText || sourceText.trim().length === 0) return [];

  const lines = sourceText.split("\n");
  const sentences: SourceSentence[] = [];

  let currentText = "";
  let startLineNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();

    // Skip empty lines — they mark paragraph boundaries
    if (!line) {
      if (currentText.trim().length > 0) {
        sentences.push({
          lineNumber: startLineNumber + 1, // 1-based
          text: currentText.trim(),
        });
        currentText = "";
      }
      continue;
    }

    if (currentText.trim().length === 0) {
      startLineNumber = i;
    }

    // Append the line
    currentText += (currentText ? " " : "") + line;

    // Check if this line ends with a sentence boundary
    if (/[.!?。！？]$/.test(line)) {
      sentences.push({
        lineNumber: startLineNumber + 1, // 1-based
        text: currentText.trim(),
      });
      currentText = "";
    }
  }

  // Don't forget the last accumulated text
  if (currentText.trim().length > 0) {
    sentences.push({
      lineNumber: startLineNumber + 1, // 1-based
      text: currentText.trim(),
    });
  }

  return sentences;
}

/**
 * findActiveSentenceIndex — Given the target line number and the list of
 * source sentences, find which sentence the user is currently working on.
 *
 * Strategy: Find the sentence whose lineNumber is closest to the target line,
 * preferring sentences that come BEFORE or AT the target line.
 */
function findActiveSentenceIndex(
  activeTargetLine: number,
  sentences: SourceSentence[]
): number {
  if (sentences.length === 0) return -1;

  // Find the last sentence whose start lineNumber is <= activeTargetLine
  let bestIdx = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].lineNumber <= activeTargetLine) {
      bestIdx = i;
    } else {
      break;
    }
  }
  return bestIdx;
}

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
    sourceText,
    activeTargetLine,
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

  // Sentence list — derived from sourceText
  const sentencesRef = useRef<SourceSentence[]>([]);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);

  // Track which active line triggered the last prefetch cycle
  const lastPrefetchLineRef = useRef<number>(-1);

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

  // ─── Sentence Splitting (on sourceText change) ───────────────────────
  useEffect(() => {
    const sentences = splitSourceIntoSentences(sourceText ?? "");
    sentencesRef.current = sentences;
    console.log(`[RDAT-Prefetch] Source text split into ${sentences.length} sentences`);

    // Compute active sentence index
    const idx = findActiveSentenceIndex(activeTargetLine, sentences);
    setActiveSentenceIndex(idx);
    lastPrefetchLineRef.current = -1; // Force re-evaluation
  }, [sourceText]);

  // ─── Active Sentence Index (on activeTargetLine change) ──────────────
  useEffect(() => {
    const idx = findActiveSentenceIndex(activeTargetLine, sentencesRef.current);
    setActiveSentenceIndex(idx);
  }, [activeTargetLine]);

  /**
   * prefetchSingleSentence — Generate dual-version translation for a single sentence.
   * Skips if already cached.
   */
  const prefetchSingleSentence = useCallback(
    async (sourceSentence: string, abortSignal: AbortSignal): Promise<boolean> => {
      const safeSentence = String(sourceSentence ?? "");
      if (!safeSentence || safeSentence.trim().length < 3) return false;

      // Check cache first
      if (cacheRef.current.has(safeSentence)) {
        console.log("[RDAT-Prefetch] Cache hit for:", safeSentence.substring(0, 60));
        return true; // Already cached
      }

      if (abortSignal.aborted) return false;
      if (!isLLMReadyRef.current) {
        console.log("[RDAT-Prefetch] LLM not ready — skipping prefetch");
        return false;
      }

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

        if (abortSignal.aborted) return false;

        // Build prompt and generate
        const direction = languageDirectionRef.current;
        const messages = buildDualVersionPrompt(safeSentence, direction, currentRagResults);

        console.log(
          `[RDAT Debug] Requesting translation for: "${safeSentence.substring(0, 60)}${safeSentence.length > 60 ? "…" : ""}"`
        );
        console.log("[RDAT Debug] Language direction:", direction);
        console.log("[RDAT Debug] RAG context entries:", (currentRagResults?.length ?? 0));
        console.log("[RDAT Debug] Prompt messages:", messages.map((m) => ({ role: m.role, contentLen: m.content.length })));

        console.log("[RDAT Debug] Calling LLM generate with max_tokens:", DUAL_VERSION_MAX_TOKENS);
        const result = await generateRef.current?.(messages, DUAL_VERSION_MAX_TOKENS) ?? null;
        console.log("[RDAT Debug] Engine responded with:", result ? `"${result.substring(0, 120)}${result.length > 120 ? "…" : ""}"` : "null/empty");

        if (abortSignal.aborted) return false;

        if (result && result.trim()) {
          const parsed = parseDualVersionResponse(result.trim());
          if (parsed && parsed.length >= 2) {
            cacheRef.current.set(safeSentence, parsed);
            setCacheVersion((v) => v + 1);
            console.log(
              `[RDAT-Prefetch] Cached ${parsed.length} versions for: "${safeSentence.substring(0, 60)}"`,
              parsed.map((v: string) => `"${v.substring(0, 40)}${v.length > 40 ? "…" : ""}"`)
            );
            return true;
          } else {
            console.log("[RDAT-Prefetch] Could not parse dual versions from LLM output:", result.substring(0, 100));
            // Store the single result as both versions as fallback
            cacheRef.current.set(safeSentence, [result.trim(), result.trim()]);
            setCacheVersion((v) => v + 1);
            return true;
          }
        } else {
          console.log("[RDAT-Prefetch] LLM returned null/empty");
          return false;
        }
      } catch (err) {
        if (abortSignal.aborted) {
          console.log("[RDAT-Prefetch] Prefetch aborted — user changed line");
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[RDAT-Prefetch] Prefetch failed:", msg);
          setError(msg);
        }
        return false;
      } finally {
        if (abortControllerRef.current?.signal === abortSignal) {
          setIsPrefetching(false);
          setPrefetchingSentence(null);
        }
      }
    },
    []
  );

  /**
   * runPrefetchCycle — Process the prefetch queue sequentially.
   * Translates sentences from max(0, N-1) to min(len-1, N+3).
   */
  const runPrefetchCycle = useCallback(
    async (activeLine: number) => {
      const sentences = sentencesRef.current;
      if (sentences.length === 0) return;

      const sentenceIdx = findActiveSentenceIndex(activeLine, sentences);
      if (sentenceIdx < 0) return;

      // Compute the window: [max(0, N-1), min(len-1, N+3)]
      const startIdx = Math.max(0, sentenceIdx - PREFETCH_WINDOW_BEHIND);
      const endIdx = Math.min(sentences.length - 1, sentenceIdx + PREFETCH_WINDOW_AHEAD);

      console.log(
        `[RDAT-Prefetch] Starting prefetch cycle: active line ${activeLine}, ` +
        `sentence ${sentenceIdx}, window [${startIdx}..${endIdx}]`
      );

      // Abort any previous in-flight request (but don't clear the queue)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        interruptRef.current();
        console.log("[RDAT-Prefetch] Aborted previous in-flight generation");
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Process sentences sequentially
      for (let i = startIdx; i <= endIdx; i++) {
        if (abortController.signal.aborted) {
          console.log("[RDAT-Prefetch] Cycle aborted at sentence", i);
          break;
        }

        const sentence = sentences[i];
        if (!sentence) continue;

        await prefetchSingleSentence(sentence.text, abortController.signal);
      }

      if (!abortController.signal.aborted) {
        console.log("[RDAT-Prefetch] Prefetch cycle completed");
      }

      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
        setIsPrefetching(false);
        setPrefetchingSentence(null);
      }
    },
    [prefetchSingleSentence]
  );

  /**
   * interruptPrefetch — Forcefully cancel the CURRENT in-flight request only.
   * Does NOT clear the queue — the next debounce cycle will re-evaluate.
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

  // ─── Trigger prefetch cycle when activeTargetLine changes ──────────
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const sentences = sentencesRef.current;
    if (sentences.length === 0) return;

    const sentenceIdx = findActiveSentenceIndex(activeTargetLine, sentences);
    if (sentenceIdx < 0) return;

    // Skip if the active line hasn't actually changed
    if (lastPrefetchLineRef.current === activeTargetLine) return;

    debounceTimerRef.current = setTimeout(() => {
      lastPrefetchLineRef.current = activeTargetLine;
      runPrefetchCycle(activeTargetLine);
    }, PREFETCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [activeTargetLine, runPrefetchCycle]);

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
    interruptPrefetch,
    getCachedVersions,
    clearCache,
    allSentences: sentencesRef.current,
    activeSentenceIndex,
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
  cleaned = cleaned.replace(/^["'\u00AB]|["'\u00BB]$/g, "");

  return cleaned.trim();
}
