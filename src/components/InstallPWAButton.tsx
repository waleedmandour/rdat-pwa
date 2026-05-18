"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Download, X } from "lucide-react";

export function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [isInstalled, setIsInstalled] = React.useState(false);

  React.useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled || !deferredPrompt) return null;

  return (
    <div className="w-full bg-primary/10 border-b border-primary/20 text-foreground px-4 py-2.5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-primary/20 rounded-md text-primary">
          <Download className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Install App</span>
          <span className="text-xs text-muted-foreground">Install the app on your device for quick access and offline capabilities.</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleInstall}
          className="px-4 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
        >
          Install
        </button>
        <button
          onClick={() => setDeferredPrompt(null)}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-hover rounded-md transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
