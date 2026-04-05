"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import type {
  RAGState,
  RAGResult,
  RAGTiming,
  WorkerResponse,
  WorkerRequest,
  CorpusEntry,
} from "@/lib/rag-types";
import { DEFAULT_CORPUS_URL, CORPUS_CACHE_VERSION, CORPUS_CACHE_KEY } from "@/lib/constants";
import { getAssetUrl } from "@/lib/asset-url";

// ─── Request ID Counter ───────────────────────────────────────────
let requestIdCounter = 0;

// ─── Hydration-Safe Client Detection ──────────────────────────────
const getIsClient = () => true;
const subscribeNoop = () => () => {};

/**
 * useGTRBootstrapper — Manages the GTR (Generative Translation Repository) lifecycle.
 *
 * Extends the RAG pipeline with corpus caching and version tracking:
 *   1. On mount: checks localStorage for cached corpus + version
 *   2. If version matches: sends pre-loaded corpus to Worker (skips HTTP fetch)
 *   3. If version mismatch or no cache: Worker fetches from URL, we cache for next time
 *   4. On bootstrap-complete: saves corpus version to localStorage
 *   5. Provides the same search() interface as useRAG for downstream consumers
 *
 * This avoids re-fetching the JSON corpus on every page refresh while keeping
 * the in-memory Orama vector DB fast and fresh.
 */
export function useGTRBootstrapper() {
  const [ragState, setRagState] = useState<RAGState>("idle");
  const [lastResults, setLastResults] = useState<RAGResult[]>([]);
  const [lastTiming, setLastTiming] = useState<RAGTiming | null>(null);
  const [embeddingMode, setEmbeddingMode] = useState<"real" | "fallback">(
    "fallback"
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [corpusCount, setCorpusCount] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  const pendingRequestsRef = useRef<
    Map<
      string,
      {
        resolve: (results: RAGResult[]) => void;
      }
    >
  >(new Map());

  const isClient = useSyncExternalStore(
    subscribeNoop,
    getIsClient,
    () => false
  );

  /**
   * loadCachedCorpus — Reads the cached corpus from localStorage.
   * Returns null if not cached, version mismatch, or parse error.
   */
  const loadCachedCorpus = useCallback((): CorpusEntry[] | null => {
    try {
      const cached = localStorage.getItem(CORPUS_CACHE_KEY);
      if (!cached) return null;

      const parsed = JSON.parse(cached) as {
        version: string;
        corpus: CorpusEntry[];
      };

      if (parsed.version !== CORPUS_CACHE_VERSION) {
        console.log("[RDAT-GTR] Corpus cache version mismatch — re-fetching");
        return null;
      }

      if (!Array.isArray(parsed.corpus) || (parsed?.corpus?.length ?? 0) === 0) {
        return null;
      }

      console.log(
        `[RDAT-GTR] Loaded ${parsed?.corpus?.length ?? 0} entries from localStorage cache`
      );
      return parsed.corpus;
    } catch {
      return null;
    }
  }, []);

  /**
   * saveCorpusToCache — Persists the corpus JSON to localStorage with version stamp.
   */
  const saveCorpusToCache = useCallback(
    (corpus: CorpusEntry[]) => {
      try {
        const payload = {
          version: CORPUS_CACHE_VERSION,
          corpus,
        };
        localStorage.setItem(CORPUS_CACHE_KEY, JSON.stringify(payload));
        console.log(
          `[RDAT-GTR] Cached ${corpus.length} corpus entries to localStorage (v${CORPUS_CACHE_VERSION})`
        );
      } catch (err) {
        console.warn("[RDAT-GTR] Failed to cache corpus to localStorage:", err);
      }
    },
    []
  );

  // ─── Create Worker & Bootstrap ─────────────────────────────────
  useEffect(() => {
    if (!isClient) return;

    // Create the Web Worker
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/rag-worker.ts", import.meta.url)
      );
    } catch (err) {
      console.error(
        "[RDAT-GTR] Failed to create RAG Worker:",
        err instanceof Error ? err.message : err
      );
      setRagState("error");
      setStatusMessage("Failed to create worker");
      return;
    }

    workerRef.current = worker;

    // ─── Handle messages from the Worker ──
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;

      switch (msg.type) {
        case "status":
          setRagState(msg.state);
          setStatusMessage(msg.message);
          if (msg.embeddingMode) setEmbeddingMode(msg.embeddingMode);
          break;

        case "search-result":
          setLastResults(msg.results);
          setLastTiming(msg.timing);
          const pending = pendingRequestsRef.current.get(msg.requestId);
          if (pending) {
            pending.resolve(msg.results);
            pendingRequestsRef.current.delete(msg.requestId);
          }
          break;

        case "bootstrap-complete":
          if (msg.embeddingMode) setEmbeddingMode(msg.embeddingMode);
          setCorpusCount(msg.count);
          console.log(
            `[RDAT-GTR] Bootstrapped: ${msg.count} entries (${msg.embeddingMode} embeddings)`
          );
          break;

        case "log":
          switch (msg.level) {
            case "info":
              console.log(`[RDAT-GTR] ${msg.message}`);
              break;
            case "warn":
              console.warn(`[RDAT-GTR] ${msg.message}`);
              break;
            case "error":
              console.error(`[RDAT-GTR] ${msg.message}`);
              break;
          }
          break;
      }
    };

    // ─── Handle Worker errors ──
    worker.onerror = (error) => {
      console.error("[RDAT-GTR Worker Error]:", error.message);
      setRagState("error");
      setStatusMessage(`Worker error: ${error.message}`);
    };

    // ─── Determine bootstrap strategy ──
    const cachedCorpus = loadCachedCorpus();
    const corpusUrl = getAssetUrl(DEFAULT_CORPUS_URL);

    const bootstrapMsg: WorkerRequest = cachedCorpus
      ? {
          type: "bootstrap",
          corpusUrl,
          corpusData: cachedCorpus,
        }
      : {
          type: "bootstrap",
          corpusUrl,
        };

    worker.postMessage(bootstrapMsg);

    // ─── If no cache, listen for bootstrap-complete to save ──
    if (!cachedCorpus) {
      const saveHandler = (event: MessageEvent) => {
        const msg = event.data as WorkerResponse;
        if (msg.type === "bootstrap-complete") {
          // Fetch the corpus one more time to cache it (Worker already loaded it)
          fetch(corpusUrl)
            .then((res) => {
              if (res.ok) return res.json();
              throw new Error(`HTTP ${res.status}`);
            })
            .then((data: CorpusEntry[]) => saveCorpusToCache(data))
            .catch(() => {
              // Non-fatal: cache is just an optimization
              console.warn("[RDAT-GTR] Could not fetch corpus for caching");
            });

          worker.removeEventListener("message", saveHandler);
        }
      };
      worker.addEventListener("message", saveHandler);
    }

    // ─── Cleanup on unmount ──
    return () => {
      console.log("[RDAT-GTR] Terminating RAG Worker");
      worker.terminate();
      workerRef.current = null;
      pendingRequestsRef.current.clear();
    };
  }, [isClient, loadCachedCorpus, saveCorpusToCache]);

  // ─── Search Function ───────────────────────────────────────────
  const search = useCallback(
    async (text: string): Promise<RAGResult[]> => {
      if (!workerRef.current) {
        console.warn("[RDAT-GTR] search() called but worker is not available");
        return [];
      }

      const requestId = `search-${++requestIdCounter}`;

      return new Promise((resolve) => {
        pendingRequestsRef.current.set(requestId, { resolve });

        const request: WorkerRequest = {
          type: "search",
          query: text,
          requestId,
        };

        workerRef.current!.postMessage(request);

        // Safety timeout: resolve with empty after 30s
        setTimeout(() => {
          const pending = pendingRequestsRef.current.get(requestId);
          if (pending) {
            pending.resolve([]);
            pendingRequestsRef.current.delete(requestId);
          }
        }, 30_000);
      });
    },
    []
  );

  // ─── Re-bootstrap with fresh corpus (e.g., after corpus update) ──
  const rebootstrap = useCallback(() => {
    try {
      localStorage.removeItem(CORPUS_CACHE_KEY);
    } catch { /* noop */ }

    if (workerRef.current) {
      const corpusUrl = getAssetUrl(DEFAULT_CORPUS_URL);
      workerRef.current.postMessage({
        type: "bootstrap",
        corpusUrl,
      });
    }
  }, []);

  return {
    ragState,
    lastResults,
    lastTiming,
    embeddingMode,
    statusMessage,
    corpusCount,
    search,
    rebootstrap,
    isReady: ragState === "ready",
    isSearching: ragState === "searching",
  };
}
