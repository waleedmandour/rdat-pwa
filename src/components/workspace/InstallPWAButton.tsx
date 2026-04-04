"use client";

import { useState, useEffect } from "react";
import { Download } from "lucide-react";

/**
 * InstallPWAButton — Captures the `beforeinstallprompt` event and renders
 * a visible "Install Desktop App" button in the header.
 *
 * The button only appears when:
 *   1. The browser fires `beforeinstallprompt` (Chromium-based browsers).
 *   2. The app is NOT already installed (checked via `window.navigator.standalone`
 *      or `window.matchMedia('(display-mode: standalone)')`).
 *   3. On Safari / iOS, the event never fires so the button stays hidden —
 *      users install via the browser's native share → "Add to Home Screen".
 */
export function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // ─── Listen for beforeinstallprompt ──────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isInstalled =
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true ||
      window.matchMedia("(display-mode: standalone)").matches;

    if (isInstalled) return;

    const handler = (e: Event) => {
      // Prevent the default mini-infobar
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      console.log("[RDAT] beforeinstallprompt captured — install button available");
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // ─── Clean up if app gets installed after component mounts ───────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () => {
      setDeferredPrompt(null);
      console.log("[RDAT] App installed — hiding install button");
    };

    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  // ─── Handle Install Click ────────────────────────────────────────────
  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      console.log("[RDAT] User accepted PWA install");
    } else {
      console.log("[RDAT] User dismissed PWA install");
    }

    setDeferredPrompt(null);
  };

  // Don't render if:
  //   - No prompt event captured (Safari / already installed)
  //   - User previously dismissed the button
  if (!deferredPrompt || dismissed) return null;

  return (
    <button
      onClick={handleInstall}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium
        bg-gradient-to-r from-teal-500/20 to-cyan-500/20
        text-teal-300 hover:text-teal-200
        border border-teal-500/30 hover:border-teal-400/50
        hover:from-teal-500/30 hover:to-cyan-500/30
        transition-all cursor-pointer shadow-sm hover:shadow-teal-500/10"
      title="Install RDAT Copilot as a desktop app"
    >
      <Download className="w-3.5 h-3.5" />
      <span>Install App</span>
    </button>
  );
}

/**
 * Type definition for the BeforeInstallPromptEvent.
 * This is a Chromium-specific API not yet in TypeScript's lib dom.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}
