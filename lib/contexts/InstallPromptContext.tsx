"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallResult = "accepted" | "dismissed" | "unavailable";

interface InstallPromptContextValue {
  isInstalled: boolean;
  canInstallDirectly: boolean;
  requestInstall: () => Promise<InstallResult>;
}

const InstallPromptContext = createContext<InstallPromptContextValue | null>(null);

function isRunningStandalone() {
  if (typeof window === "undefined") return false;
  const iosStandalone =
    typeof (navigator as Navigator & { standalone?: boolean }).standalone === "boolean" &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const displayModeStandalone = window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || displayModeStandalone;
}

export function InstallPromptProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setIsInstalled(isRunningStandalone());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const refreshInstalledState = () => {
      setIsInstalled(isRunningStandalone());
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("focus", refreshInstalledState);
    document.addEventListener("visibilitychange", refreshInstalledState);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("focus", refreshInstalledState);
      document.removeEventListener("visibilitychange", refreshInstalledState);
    };
  }, []);

  const requestInstall = useCallback(async (): Promise<InstallResult> => {
    if (!deferredPrompt) return "unavailable";

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome === "accepted" ? "accepted" : "dismissed";
  }, [deferredPrompt]);

  const value = useMemo<InstallPromptContextValue>(
    () => ({
      isInstalled,
      canInstallDirectly: Boolean(deferredPrompt),
      requestInstall,
    }),
    [isInstalled, deferredPrompt, requestInstall]
  );

  return <InstallPromptContext.Provider value={value}>{children}</InstallPromptContext.Provider>;
}

export function useInstallPrompt() {
  const context = useContext(InstallPromptContext);
  if (!context) {
    throw new Error("useInstallPrompt must be used within InstallPromptProvider");
  }
  return context;
}
