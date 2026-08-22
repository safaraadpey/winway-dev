"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { logPwa } from "@/lib/pwa/pwaDebug";
import {
  BeforeInstallPromptEvent,
  PWA_EVENT_APP_INSTALLED,
  PWA_EVENT_BEFORE_INSTALL,
  PWA_EVENT_SW_READY,
  PWA_PROMPT_GRACE_MS,
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  markPwaInstalledFlag,
  readPwaInstalledFlag,
} from "@/lib/pwa/pwaInstallBootstrap";
import { registerServiceWorker } from "@/lib/pwa/registerServiceWorker";

type InstallResult = "accepted" | "dismissed" | "unavailable";

export type InstallUiState = "checking" | "installable" | "not_installable";

interface InstallPromptContextValue {
  /** True when opened from the installed app icon (standalone PWA). */
  isStandalone: boolean;
  /** True when PWA is installed on device (including browser sessions). */
  isPwaInstalledOnDevice: boolean;
  installUiState: InstallUiState;
  /** True only when native beforeinstallprompt is held and SW is ready. */
  canInstallDirectly: boolean;
  requestInstall: () => Promise<InstallResult>;
}

const InstallPromptContext = createContext<InstallPromptContextValue | null>(
  null
);

function isRunningStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone =
    typeof (navigator as Navigator & { standalone?: boolean }).standalone ===
      "boolean" &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const displayModeStandalone = window.matchMedia(
    "(display-mode: standalone)"
  ).matches;
  const displayModeMinimalUi = window.matchMedia(
    "(display-mode: minimal-ui)"
  ).matches;
  return iosStandalone || displayModeStandalone || displayModeMinimalUi;
}

function syncPromptFromWindow(
  setDeferredPrompt: (e: BeforeInstallPromptEvent | null) => void,
  deferredRef: React.MutableRefObject<BeforeInstallPromptEvent | null>
) {
  const existing = getDeferredInstallPrompt();
  if (existing) {
    deferredRef.current = existing;
    setDeferredPrompt(existing);
  }
}

export function InstallPromptProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isPwaInstalledOnDevice, setIsPwaInstalledOnDevice] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const [swSettled, setSwSettled] = useState(false);
  const [promptGraceExpired, setPromptGraceExpired] = useState(false);

  useEffect(() => {
    const syncStandalone = () => setIsStandalone(isRunningStandalonePwa());
    const syncInstalledOnDevice = () => {
      setIsPwaInstalledOnDevice(
        isRunningStandalonePwa() || readPwaInstalledFlag()
      );
    };

    syncStandalone();
    syncInstalledOnDevice();

    syncPromptFromWindow(setDeferredPrompt, deferredRef);

    const onBeforeInstallPrompt = () => {
      syncPromptFromWindow(setDeferredPrompt, deferredRef);
    };

    const onInstalled = () => {
      markPwaInstalledFlag();
      setIsPwaInstalledOnDevice(true);
      deferredRef.current = null;
      setDeferredPrompt(null);
      clearDeferredInstallPrompt();
    };

    const onSwReady = () => {
      setSwReady(true);
      setSwSettled(true);
    };

    const refreshDisplayState = () => {
      syncStandalone();
      syncInstalledOnDevice();
    };

    window.addEventListener(PWA_EVENT_BEFORE_INSTALL, onBeforeInstallPrompt);
    window.addEventListener(PWA_EVENT_APP_INSTALLED, onInstalled);
    window.addEventListener(PWA_EVENT_SW_READY, onSwReady);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("focus", refreshDisplayState);
    document.addEventListener("visibilitychange", refreshDisplayState);

    void (async () => {
      if ("serviceWorker" in navigator) {
        if (navigator.serviceWorker.controller) {
          logPwa("service worker controlling");
        }
        try {
          await navigator.serviceWorker.ready;
          setSwReady(true);
          logPwa("service worker ready");
          if (navigator.serviceWorker.controller) {
            logPwa("service worker controlling");
          }
        } catch {
          // ignore
        } finally {
          setSwSettled(true);
        }
      } else {
        setSwSettled(true);
      }

      const manifestLink = document.querySelector('link[rel="manifest"]');
      const href = manifestLink?.getAttribute("href");
      if (href) {
        try {
          const res = await fetch(href, { cache: "no-store" });
          if (res.ok) {
            logPwa("manifest loaded", { href, status: res.status });
          }
        } catch {
          // ignore
        }
      }
    })();

    if (process.env.NODE_ENV !== "production") {
      void registerServiceWorker();
    }

    return () => {
      window.removeEventListener(
        PWA_EVENT_BEFORE_INSTALL,
        onBeforeInstallPrompt
      );
      window.removeEventListener(PWA_EVENT_APP_INSTALLED, onInstalled);
      window.removeEventListener(PWA_EVENT_SW_READY, onSwReady);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("focus", refreshDisplayState);
      document.removeEventListener("visibilitychange", refreshDisplayState);
    };
  }, []);

  useEffect(() => {
    if (!swReady) return;
    const timer = window.setTimeout(() => {
      setPromptGraceExpired(true);
    }, PWA_PROMPT_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [swReady]);

  const installUiState = useMemo((): InstallUiState => {
    if (isStandalone) return "not_installable";
    if (isPwaInstalledOnDevice && !deferredPrompt) return "not_installable";
    if (!swSettled) return "checking";
    if (!swReady) return "not_installable";
    if (deferredPrompt) return "installable";
    if (!promptGraceExpired) return "checking";
    return "not_installable";
  }, [
    isStandalone,
    isPwaInstalledOnDevice,
    swSettled,
    swReady,
    deferredPrompt,
    promptGraceExpired,
  ]);

  const requestInstall = useCallback(async (): Promise<InstallResult> => {
    const promptEvent = deferredRef.current ?? getDeferredInstallPrompt();
    if (!promptEvent) {
      logPwa("install prompt requested but unavailable");
      return "unavailable";
    }

    logPwa("install prompt requested");
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    logPwa("user choice", { outcome: choice.outcome });

    deferredRef.current = null;
    setDeferredPrompt(null);
    clearDeferredInstallPrompt();

    if (choice.outcome === "accepted") {
      markPwaInstalledFlag();
      setIsPwaInstalledOnDevice(true);
    }

    return choice.outcome === "accepted" ? "accepted" : "dismissed";
  }, []);

  const value = useMemo<InstallPromptContextValue>(
    () => ({
      isStandalone,
      isPwaInstalledOnDevice,
      installUiState,
      canInstallDirectly: installUiState === "installable",
      requestInstall,
    }),
    [isStandalone, isPwaInstalledOnDevice, installUiState, requestInstall]
  );

  return (
    <InstallPromptContext.Provider value={value}>
      {children}
    </InstallPromptContext.Provider>
  );
}

export function useInstallPrompt() {
  const context = useContext(InstallPromptContext);
  if (!context) {
    throw new Error("useInstallPrompt must be used within InstallPromptProvider");
  }
  return context;
}
