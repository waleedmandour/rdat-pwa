"use client";

import { useEffect } from "react";

/**
 * useServiceWorker — Registers the PWA service worker on mount.
 *
 * Only runs on the client. In development, the service worker is
 * disabled by the next-pwa config to avoid caching issues during HMR.
 */
export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Let @ducanh2912/next-pwa handle registration automatically.
    // This hook exists as a future extension point for:
    // - Manual SW update prompts
    // - Push notification subscription
    // - Offline/online event listeners

    const handleOnline = () => {
      console.log("[RDAT] Network connection restored.");
    };

    const handleOffline = () => {
      console.log("[RDAT] Working offline. Cloud features may be limited.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
}
