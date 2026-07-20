"use client";

import { useEffect } from "react";
import {
  APP_SPLASH_FADE_MS,
  APP_SPLASH_IMAGE_PATH,
  APP_SPLASH_MAX_VISIBLE_MS,
  APP_SPLASH_OVERLAY_ID,
  APP_SPLASH_SESSION_KEY,
  APP_SPLASH_START_MARK,
  APP_SPLASH_TARGET_VISIBLE_MS,
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

function getSplashStartMs(): number {
  const start = (
    window as unknown as Record<string, number | undefined>
  )[APP_SPLASH_START_MARK];
  return typeof start === "number" ? start : performance.now();
}

function remainingMs(fromStart: number, budgetMs: number): number {
  return Math.max(0, budgetMs - (performance.now() - fromStart));
}

/** Ready when load + image done, and at least TARGET elapsed; capped by MAX. */
async function waitForSplashDismissGate(fromStart: number): Promise<"ready" | "max"> {
  const minHold = delay(remainingMs(fromStart, APP_SPLASH_TARGET_VISIBLE_MS));
  const maxHold = delay(remainingMs(fromStart, APP_SPLASH_MAX_VISIBLE_MS));

  return Promise.race([
    Promise.all([
      waitForWindowLoad(),
      waitForSplashImage(),
      minHold,
    ]).then(() => "ready" as const),
    maxHold.then(() => "max" as const),
  ]);
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
      const fromStart = getSplashStartMs();
      let gate: "ready" | "max" = "ready";

      try {
        gate = await waitForSplashDismissGate(fromStart);
      } catch (err) {
        console.warn("[Splash] readiness wait failed (continuing):", err);
      }

      if (cancelled) return;

      const visibleMs = Math.round(performance.now() - fromStart);
      console.info("[Splash] Fading out", {
        visibleMs,
        gate,
        targetMs: APP_SPLASH_TARGET_VISIBLE_MS,
        maxMs: APP_SPLASH_MAX_VISIBLE_MS,
      });

      overlay.setAttribute("data-fading", "true");

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
