"use client";

import { useEffect } from "react";
import {
  APP_SPLASH_FADE_MS,
  APP_SPLASH_IMAGE_PATH,
  APP_SPLASH_MIN_VISIBLE_MS,
  APP_SPLASH_OVERLAY_ID,
  APP_SPLASH_SESSION_KEY,
  APP_SPLASH_START_MARK,
} from "@/lib/splash/appSplash";

type AppSplashScreenProps = {
  enabled: boolean;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForWindowLoad(): Promise<void> {
  if (document.readyState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
  });
}

function waitForSplashImage(): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = APP_SPLASH_IMAGE_PATH;
  });
}

function remainingMinVisibleMs(): number {
  const start = (
    window as unknown as Record<string, number | undefined>
  )[APP_SPLASH_START_MARK];
  const elapsed =
    typeof start === "number" ? performance.now() - start : APP_SPLASH_MIN_VISIBLE_MS;
  return Math.max(0, APP_SPLASH_MIN_VISIBLE_MS - elapsed);
}

function markSplashDone(): void {
  document.documentElement.setAttribute("data-splash-phase", "done");
  try {
    sessionStorage.setItem(APP_SPLASH_SESSION_KEY, "1");
  } catch {
    // ignore private mode / blocked storage
  }
}

export default function AppSplashScreen({ enabled }: AppSplashScreenProps) {
  useEffect(() => {
    if (!enabled) return;

    const root = document.documentElement;
    if (root.getAttribute("data-splash-phase") === "done") {
      return;
    }

    const overlay = document.getElementById(APP_SPLASH_OVERLAY_ID);
    if (!overlay) {
      markSplashDone();
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        await Promise.all([
          waitForWindowLoad(),
          waitForSplashImage(),
          delay(remainingMinVisibleMs()),
        ]);
      } catch (err) {
        console.warn("[Splash] readiness wait failed (continuing):", err);
      }

      if (cancelled) return;

      overlay.setAttribute("data-fading", "true");
      console.info("[Splash] Fading out");

      await delay(APP_SPLASH_FADE_MS);
      if (cancelled) return;

      markSplashDone();
      overlay.remove();
      console.info("[Splash] Dismissed");
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return null;
}
