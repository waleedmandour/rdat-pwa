"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getLTE, LocalTranslationEngine } from "@/lib/local-translation-engine";

// Worker message types
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
}

/**
 * useRAG — React hook for the RAG (Retrieval-Augmented Generation) pipeline.
 *
 * Manages:
 *  - Web Worker lifecycle (rag-worker.ts)
 *  - Corpus ingestion on mount
 *  - Local Translation Engine (LTE) initialization
 *  - Semantic search + phrase matching
 *
 * Usage:
 *   const { search, lteSuggest, state } = useRAG();
 */
export function useRAG() {
  const workerRef = useRef<Worker | null>(null);
  const lteRef = useRef<LocalTranslationEngine | null>(null);
  const [state, setState] = useState<RAGState>({
    isWorkerReady: false,
    isCorpusLoaded: false,
    isLoading: true,
    error: null,
    corpusSize: 0,
  });

  // Search result callbacks (to avoid stale closures in worker listener)
  const searchCallbacksRef = useRef<
    Map<string, (hits: RAGHit[]) => void>
  >(new Map());

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

          // Send corpus to worker for embedding + indexing
          worker.postMessage({
            type: "INGEST_CORPUS",
            payload: { entries: corpus },
          });

          // Listen for worker messages
          worker.onmessage = (event) => {
            const { type: msgType, payload } = event.data;

            switch (msgType) {
              case "WORKER_READY":
                if (!cancelled) {
                  setState((prev) => ({ ...prev, isWorkerReady: true }));
                }
                break;

              case "INIT_COMPLETE":
                break;

              case "INIT_ERROR":
                if (!cancelled) {
                  setState((prev) => ({
                    ...prev,
                    error: payload.error,
                    isWorkerReady: false,
                  }));
                }
                break;

              case "INGEST_COMPLETE":
                if (!cancelled) {
                  setState((prev) => ({
                    ...prev,
                    isCorpusLoaded: true,
                    isLoading: false,
                    corpusSize: payload.count,
                  }));
                }
                break;

              case "SEARCH_RESULTS":
                // Resolve the pending search callback
                const cb = searchCallbacksRef.current.get(payload.query);
                if (cb) {
                  cb(payload.hits);
                  searchCallbacksRef.current.delete(payload.query);
                }
                break;

              case "SEARCH_ERROR":
                const errCb = searchCallbacksRef.current.get(payload.query || "");
                if (errCb) errCb([]);
                if (!cancelled) {
                  setState((prev) => ({
                    ...prev,
                    error: payload.error,
                  }));
                }
                break;
            }
          };

          worker.onerror = (err: ErrorEvent) => {
            if (!cancelled) {
              setState((prev) => ({
                ...prev,
                error: `Worker error: ${err.message}`,
                isWorkerReady: false,
              }));
            }
          };
        } catch (workerErr: any) {
          // Worker initialization failed — LTE still works, RAG is degraded
          console.warn("[RAG] Worker failed to initialize:", workerErr.message);
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
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // ── Semantic Search (via Worker) ──────────────────────────
  const search = useCallback(
    (query: string, limit = 3): Promise<RAGHit[]> => {
      return new Promise((resolve) => {
        if (!workerRef.current || !state.isCorpusLoaded) {
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
        searchCallbacksRef.current.set(query, resolve);

        workerRef.current.postMessage({
          type: "SEARCH",
          payload: { query, limit },
        });

        // Timeout fallback (5 seconds)
        setTimeout(() => {
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
        }, 5000);
      });
    },
    [state.isCorpusLoaded]
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
