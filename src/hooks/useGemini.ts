"use client";

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { GeminiState, LanguageDirection } from "@/types";
import type { RAGResult } from "@/lib/rag-types";
import { GEMINI_API_KEY_STORAGE } from "@/lib/constants";
import { initGemini, disposeGemini, isGeminiReady, rewriteText, completeGhostText } from "@/lib/gemini-provider";

const getIsClient = () => true;
const subscribeNoop = () => () => {};

// ─── Module-level localStorage subscription for useSyncExternalStore ─
// This enables React to re-render when localStorage is written from the
// same window (the native "storage" event only fires for cross-tab changes).

const storageListeners = new Set<() => void>();

function notifyStorageChange(): void {
  storageListeners.forEach((listener) => listener());
}

function subscribeToStorage(callback: () => void): () => void {
  storageListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    storageListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getStorageKeyValue(): string {
  try {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function useGemini() {
  const [isRewriting, setIsRewriting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const isClient = useSyncExternalStore(subscribeNoop, getIsClient, () => false);

  // Read the API key from localStorage via useSyncExternalStore.
  // This avoids setState-in-effect and keeps React in sync with localStorage.
  const storedKey = useSyncExternalStore(
    isClient ? subscribeToStorage : subscribeNoop,
    getStorageKeyValue,
    () => "" // SSR fallback
  );

  const hasApiKey = storedKey.length > 0;

  // Derive geminiState from independent state — no override/ref needed.
  const geminiState: GeminiState = hasError
    ? "error"
    : isRewriting
      ? "generating"
      : hasApiKey
        ? "ready"
        : "idle";

  // Track the last key we initialized to avoid re-initializing.
  const initializedKeyRef = useRef<string | null>(null);

  // Initialize the Gemini client as a side effect when the stored key appears.
  // Only calls initGemini (external system init) — no setState.
  useEffect(() => {
    if (!isClient || !storedKey) return;
    if (initializedKeyRef.current === storedKey) return;
    initializedKeyRef.current = storedKey;
    initGemini(storedKey.trim());
    console.log("[RDAT-Gemini] Client initialized from stored key");
  }, [isClient, storedKey]);

  /**
   * setApiKey — Save a new API key to localStorage and initialize the client.
   */
  const setApiKey = useCallback((key: string) => {
    setHasError(false);
    if (!key || key.trim().length === 0) {
      try { localStorage.removeItem(GEMINI_API_KEY_STORAGE); } catch { /* noop */ }
      disposeGemini();
      notifyStorageChange();
      console.log("[RDAT-Gemini] API key removed");
      return;
    }

    try {
      localStorage.setItem(GEMINI_API_KEY_STORAGE, key.trim());
      initGemini(key.trim());
      notifyStorageChange();
      console.log("[RDAT-Gemini] API key saved and client initialized");
    } catch (err) {
      console.error("[RDAT-Gemini] Failed to save API key:", err);
      setHasError(true);
    }
  }, []);

  /**
   * getMaskedKey — Returns the API key with only the last 4 chars visible.
   */
  const getMaskedKey = useCallback((): string => {
    try {
      const key = localStorage.getItem(GEMINI_API_KEY_STORAGE);
      if (!key) return "";
      if (key.length <= 8) return "••••";
      return "••••" + key.slice(-4);
    } catch {
      return "";
    }
  }, []);

  /**
   * rewrite — Send text to Gemini for rewriting.
   */
  const rewrite = useCallback(
    async (text: string, ragResults: RAGResult[] = [], direction: LanguageDirection = "en-ar", instruction?: string, sourceText?: string): Promise<string | null> => {
      if (!isGeminiReady()) {
        console.warn("[RDAT-Gemini] Not ready — no API key configured");
        return null;
      }

      setIsRewriting(true);

      try {
        const result = await rewriteText(text, ragResults, direction, instruction, sourceText);
        setIsRewriting(false);
        return result;
      } catch (err) {
        console.error("[RDAT-Gemini] Rewrite error:", err);
        setHasError(true);
        setIsRewriting(false);
        return null;
      }
    },
    []
  );

  /**
   * ghostText — Uses Gemini for ghost text completions (cloud fallback).
   * Called when the local WebLLM engine is not ready.
   */
  const ghostText = useCallback(
    async (sourceSentence: string, targetDraft: string, ragResults: RAGResult[] = [], direction: LanguageDirection = "en-ar"): Promise<string | null> => {
      if (!isGeminiReady()) {
        return null;
      }
      return completeGhostText(sourceSentence, targetDraft, ragResults, direction);
    },
    []
  );

  return {
    geminiState,
    hasApiKey,
    isRewriting,
    setApiKey,
    getMaskedKey,
    rewrite,
    ghostText,
  };
}
