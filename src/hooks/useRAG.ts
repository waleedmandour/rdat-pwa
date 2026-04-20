"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getLTE, LocalTranslationEngine } from "@/lib/local-translation-engine";

interface CorpusEntry {
  en: string;
  ar: string;
  type: string;
}

interface RAGHit {
  score: number;
  en: string;
  ar: string;
  type: string;
  index: number;
}

export interface RAGState {
  isWorkerReady: boolean;
  isCorpusLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  corpusSize: number;
  modelsLoaded: boolean;
}

interface SearchRequest {
  query: string;
  limit: number;
  id: string;
  resolve: (hits: RAGHit[]) => void;
}

/**
 * useRAG — Integrated State Machine RAG Pipeline
 * 
 * Manages:
 *  - Worker lifecycle (rag-worker.ts with state machine)
 *  - Proper initialization sequence (models → corpus → ready)
 *  - Request queueing during initialization
 *  - 30-second init timeout with fallback
 *  - 5-second search timeout with LTE fallback
 */
export function useRAG() {
  const workerRef = useRef<Worker | null>(null);
  const lteRef = useRef<LocalTranslationEngine | null>(null);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [state, setState] = useState<RAGState>({
    isWorkerReady: false,
    isCorpusLoaded: false,
    isLoading: true,
    error: null,
    corpusSize: 0,
    modelsLoaded: false,
  });

  // Search request queue and callbacks
  const searchQueueRef = useRef<SearchRequest[]>([]);
  const searchCallbacksRef = useRef<Map<string, (hits: RAGHit[]) => void>>(new Map());
  const corpusRef = useRef<CorpusEntry[]>([]);

  // ── Initialize Worker + LTE on mount ──────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Initialize Local Translation Engine
        const lte = getLTE();
        lteRef.current = lte;

        // 2. Fetch corpus JSON
        const res = await fetch("/data/default-corpus-en-ar.json");
        if (!res.ok) throw new Error(`Failed to fetch corpus: ${res.status}`);
        const corpus: CorpusEntry[] = await res.json();
        corpusRef.current = corpus;

        // 3. Load corpus into LTE (instant, sync)
        lte.load(corpus);

        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          corpusSize: corpus.length,
          isLoading: false,
        }));

        // 4. Initialize Web Worker (async, runs in background)
        try {
          const worker = new Worker(
            new URL("../workers/rag-worker.ts", import.meta.url),
            { type: "module" }
          );
          workerRef.current = worker;

          // Setup timeout for initialization (30 seconds)
          initTimeoutRef.current = setTimeout(() => {
            if (!cancelled && !state.isCorpusLoaded) {
              console.warn("[RAG] Initialization timeout — using LTE fallback");
              if (!cancelled) {
                setState((prev) => ({
                  ...prev,
                  isLoading: false,
                  error: "RAG initialization timeout — using LTE only",
                }));
              }
            }
          }, 30000);

          // Listen for worker messages
          worker.onmessage = (event) => {
            const { type: msgType, payload } = event.data;

            if (cancelled) return;

            switch (msgType) {
              case "READY":
              case "WORKER_READY":
                console.log("[RAG] Worker ready, initializing models...");
                setState((prev) => ({ ...prev, isWorkerReady: true }));
                // Send initialization signal
                worker.postMessage({ type: "INIT_MODELS", payload: {} });
                break;

              case "MODELS_READY":
                console.log("[RAG] Models loaded, sending corpus for indexing...");
                setState((prev) => ({ ...prev, modelsLoaded: true }));
                // Send corpus for indexing
                if (corpus.length > 0) {
                  worker.postMessage({
                    type: "INGEST_CORPUS",
                    payload: { entries: corpus },
                  });
                } else {
                  console.warn("[RAG] No corpus data to index");
                  setState((prev) => ({
                    ...prev,
                    isCorpusLoaded: true,
                    isLoading: false,
                    error: "No corpus data available",
                  }));
                }
                break;

              case "STATE_CHANGE":
                if (payload.status === "indexing") {
                  console.log("[RAG] Corpus indexing started");
                }
                break;

              case "INDEXING_PROGRESS":
                console.log(
                  `[RAG] Indexing progress: ${payload.processed}/${payload.total}`
                );
                break;

              case "INDEXING_COMPLETE":
                if (initTimeoutRef.current) {
                  clearTimeout(initTimeoutRef.current);
                }
                console.log("[RAG] Corpus indexed successfully");
                setState((prev) => ({
                  ...prev,
                  isCorpusLoaded: true,
                  isLoading: false,
                  corpusSize: payload.count,
                  modelsLoaded: true,
                }));
                // Process any queued searches
                processSearchQueue();
                break;

              case "INIT_ERROR":
              case "INDEXING_ERROR":
                if (initTimeoutRef.current) {
                  clearTimeout(initTimeoutRef.current);
                }
                console.error("[RAG] Worker error:", payload.error);
                setState((prev) => ({
                  ...prev,
                  error: payload.error,
                  isLoading: false,
                }));
                break;

              case "SEARCH_RESULTS":
                // Resolve the pending search callback
                const cb = searchCallbacksRef.current.get(payload.query);
                if (cb && payload.hits) {
                  cb(payload.hits);
                  searchCallbacksRef.current.delete(payload.query);
                }
                break;

              case "SEARCH_ERROR":
                console.warn("[RAG] Search error:", payload.error);
                const errCb = searchCallbacksRef.current.get(payload.query || "");
                if (errCb) {
                  errCb([]);
                  searchCallbacksRef.current.delete(payload.query || "");
                }
                break;

              case "STATUS_RESPONSE":
                console.log("[RAG] Worker status:", payload.state);
                break;
            }
          };

          worker.onerror = (err: ErrorEvent) => {
            if (!cancelled) {
              console.error("[RAG] Worker error event:", err);
              setState((prev) => ({
                ...prev,
                error: `Worker error: ${err.message}`,
                isWorkerReady: false,
              }));
            }
          };
        } catch (workerErr: any) {
          if (initTimeoutRef.current) {
            clearTimeout(initTimeoutRef.current);
          }
          console.warn("[RAG] Worker initialization failed:", workerErr.message);
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              error: `Worker unavailable: ${workerErr.message}`,
              isWorkerReady: false,
              isLoading: false,
            }));
          }
        }
      } catch (err: any) {
        if (initTimeoutRef.current) {
          clearTimeout(initTimeoutRef.current);
        }
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: err.message,
            isLoading: false,
          }));
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  /**
   * Process queued searches after corpus is loaded.
   */
  const processSearchQueue = useCallback(() => {
    const queue = [...searchQueueRef.current];
    searchQueueRef.current = [];

    for (const request of queue) {
      if (workerRef.current && state.isCorpusLoaded) {
        searchCallbacksRef.current.set(request.query, request.resolve);
        workerRef.current.postMessage({
          type: "SEARCH",
          payload: { query: request.query, limit: request.limit, id: request.id },
        });
      } else {
        // Fallback to LTE
        const lteResults = lteRef.current?.search(request.query, request.limit) ?? [];
        request.resolve(
          lteResults.map((r, i) => ({
            score: r.score,
            en: r.en,
            ar: r.ar,
            type: r.type,
            index: i,
          }))
        );
      }
    }
  }, [state.isCorpusLoaded]);

  // ── Semantic Search (via Worker with queueing) ───────────
  const search = useCallback(
    (query: string, limit = 3): Promise<RAGHit[]> => {
      return new Promise((resolve) => {
        if (!workerRef.current || !state.isCorpusLoaded) {
          // Queue search if corpus not ready
          if (state.isLoading) {
            const id = `search_${Date.now()}_${Math.random()}`;
            searchQueueRef.current.push({
              query,
              limit,
              id,
              resolve,
            });
            return;
          }

          // Fallback to LTE search
          const lteResults = lteRef.current?.search(query, limit) ?? [];
          resolve(
            lteResults.map((r, i) => ({
              score: r.score,
              en: r.en,
              ar: r.ar,
              type: r.type,
              index: i,
            }))
          );
          return;
        }

        // Register callback for worker response
        const id = `search_${Date.now()}_${Math.random()}`;
        searchCallbacksRef.current.set(query, resolve);

        workerRef.current.postMessage({
          type: "SEARCH",
          payload: { query, limit, id },
        });

        // Timeout fallback (5 seconds)
        setTimeout(() => {
          if (searchCallbacksRef.current.has(query)) {
            searchCallbacksRef.current.delete(query);
            const lteResults = lteRef.current?.search(query, limit) ?? [];
            resolve(
              lteResults.map((r, i) => ({
                score: r.score,
                en: r.en,
                ar: r.ar,
                type: r.type,
                index: i,
              }))
            );
          }
        }, 5000);
      });
    },
    [state.isCorpusLoaded, state.isLoading]
  );

  // ── LTE Suggestion (synchronous, <5ms) ───────────────────
  const lteSuggest = useCallback(
    (sourceText: string, targetPrefix: string) => {
      if (!lteRef.current) return null;
      return lteRef.current.getSuggestion(sourceText, targetPrefix);
    },
    []
  );

  // ── LTE Search (synchronous) ─────────────────────────────
  const lteSearch = useCallback(
    (sourceText: string, limit = 5) => {
      if (!lteRef.current) return [];
      return lteRef.current.search(sourceText, limit);
    },
    []
  );

  return {
    search,
    lteSuggest,
    lteSearch,
    state,
  };
}
