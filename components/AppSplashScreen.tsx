"use client";

import { useEffect, useState } from "react";
import {
  APP_SPLASH_FADE_MS,
  APP_SPLASH_IMAGE_PATH,
  APP_SPLASH_MAX_VISIBLE_MS,
  APP_SPLASH_OVERLAY_ID,
  APP_SPLASH_START_MARK,
  APP_SPLASH_TARGET_VISIBLE_MS,
} from "@/lib/splash/appSplash";
import {
  isSplashDismissedInSession,
  persistSplashDismissed,
} from "@/lib/splash/splashSession";

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

async function waitForSplashDismissGate(
  fromStart: number
): Promise<"ready" | "max"> {
  const minHold = delay(remainingMs(fromStart, APP_SPLASH_TARGET_VISIBLE_MS));
  const maxHold = delay(remainingMs(fromStart, APP_SPLASH_MAX_VISIBLE_MS));

  return Promise.race([
    Promise.all([waitForWindowLoad(), waitForSplashImage(), minHold]).then(
      () => "ready" as const
    ),
    maxHold.then(() => "max" as const),
  ]);
}

function readInitialSplashVisible(enabled: boolean): boolean {
  if (!enabled) return false;
  if (typeof window === "undefined") return false;
  return !isSplashDismissedInSession();
}

export default function AppSplashScreen({ enabled }: AppSplashScreenProps) {
  const [isSplashVisible, setIsSplashVisible] = useState(() =>
    readInitialSplashVisible(enabled)
  );
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsSplashVisible(false);
      setIsFading(false);
      return;
    }

    if (isSplashDismissedInSession()) {
      persistSplashDismissed();
      setIsSplashVisible(false);
      setIsFading(false);
      return;
    }

    setIsSplashVisible(true);
    setIsFading(false);

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

      setIsFading(true);
      await delay(APP_SPLASH_FADE_MS);
      if (cancelled) return;

      persistSplashDismissed();
      setIsSplashVisible(false);
      setIsFading(false);
      console.info("[Splash] Dismissed");
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled || !isSplashVisible) {
    return null;
  }

  return (
    <div
      id={APP_SPLASH_OVERLAY_ID}
      aria-hidden="true"
      data-fading={isFading ? "true" : undefined}
    />
  );
}
