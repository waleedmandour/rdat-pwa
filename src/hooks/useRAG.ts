"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useSyncExternalStore,
} from "react";
import type {
  RAGState,
  RAGResult,
  RAGTiming,
  WorkerResponse,
  WorkerRequest,
} from "@/lib/rag-types";
import { CORPUS_BOOTSTRAP_URL } from "@/lib/constants";
import { getAssetUrl } from "@/lib/asset-url";

// ─── Request ID Counter ───────────────────────────────────────────
let requestIdCounter = 0;

// ─── Hydration-Safe Client Detection ──────────────────────────────
const getIsClient = () => true;
const subscribeNoop = () => () => {};

/**
 * useRAG — Manages the RAG Web Worker lifecycle and provides
 * a search interface for semantic retrieval from the GTR.
 *
 * Worker Lifecycle:
 *   1. Mount → create Worker via new URL() (Turbopack bundles it)
 *   2. Mount → send "bootstrap" command → worker fetches corpus, loads model, indexes
 *   3. User types → debounce settles → call search() → worker embeds + queries Orama
 *   4. Unmount → terminate worker, clear pending requests
 */
export function useRAG() {
  const [ragState, setRagState] = useState<RAGState>("idle");
  const [lastResults, setLastResults] = useState<RAGResult[]>([]);
  const [lastTiming, setLastTiming] = useState<RAGTiming | null>(null);
  const [embeddingMode, setEmbeddingMode] = useState<"real" | "fallback">(
    "fallback"
  );
  const [statusMessage, setStatusMessage] = useState("");

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

  // ─── Create Worker & Bootstrap ─────────────────────────────────
  useEffect(() => {
    if (!isClient) return;

    // Create the Web Worker — Turbopack handles bundling via new URL()
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/rag-worker.ts", import.meta.url)
      );
    } catch (err) {
      console.error(
        "[RDAT] Failed to create RAG Worker:",
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
          // Resolve any pending promise
          const pending = pendingRequestsRef.current.get(msg.requestId);
          if (pending) {
            pending.resolve(msg.results);
            pendingRequestsRef.current.delete(msg.requestId);
          }
          break;

        case "bootstrap-complete":
          if (msg.embeddingMode) setEmbeddingMode(msg.embeddingMode);
          console.log(
            `[RDAT] GTR bootstrapped: ${msg.count} entries (${msg.embeddingMode} embeddings)`
          );
          break;

        case "log":
          switch (msg.level) {
            case "info":
              console.log(`[RDAT] ${msg.message}`);
              break;
            case "warn":
              console.warn(`[RDAT] ${msg.message}`);
              break;
            case "error":
              console.error(`[RDAT] ${msg.message}`);
              break;
          }
          break;
      }
    };

    // ─── Handle Worker errors ──
    worker.onerror = (error) => {
      console.error("[RDAT Worker Error]:", error.message);
      setRagState("error");
      setStatusMessage(`Worker error: ${error.message}`);
    };

    // ─── Bootstrap the RAG pipeline immediately ──
    const bootstrapMsg: WorkerRequest = {
      type: "bootstrap",
      // Resolve corpus URL with basePath for sub-path deployments
      corpusUrl: getAssetUrl(CORPUS_BOOTSTRAP_URL),
    };
    worker.postMessage(bootstrapMsg);

    // ─── Cleanup on unmount ──
    return () => {
      console.log("[RDAT] Terminating RAG Worker");
      worker.terminate();
      workerRef.current = null;
      pendingRequestsRef.current.clear();
    };
  }, [isClient]);

  // ─── Search Function ───────────────────────────────────────────
  const search = useCallback(
    async (text: string): Promise<RAGResult[]> => {
      if (!workerRef.current) {
        console.warn("[RDAT] search() called but worker is not available");
        return [];
      }

      const requestId = `search-${++requestIdCounter}`;

      return new Promise((resolve) => {
        // Store the resolver
        pendingRequestsRef.current.set(requestId, { resolve });

        // Send search request to worker
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

  return {
    ragState,
    lastResults,
    lastTiming,
    embeddingMode,
    statusMessage,
    search,
    isReady: ragState === "ready",
    isSearching: ragState === "searching",
  };
}
