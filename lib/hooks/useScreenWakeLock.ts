"use client";

import { useEffect, useRef } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (
    type: "release",
    listener: () => void,
    options?: AddEventListenerOptions
  ) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

type NoSleepLike = {
  enable: () => Promise<void> | void;
  disable: () => void;
};

/**
 * Best-effort screen wake lock for supported mobile browsers.
 * It prevents screen auto-off while `enabled` is true.
 */
export default function useScreenWakeLock(enabled: boolean) {
  const lockRef = useRef<WakeLockSentinelLike | null>(null);
  const noSleepRef = useRef<NoSleepLike | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const nav = navigator as NavigatorWithWakeLock;
    const supportsWakeLock = Boolean(nav.wakeLock?.request);
    let cancelled = false;
    let noSleepEnabled = false;
    let removeGestureListeners: (() => void) | null = null;

    const removeNoSleepGestureListeners = () => {
      if (!removeGestureListeners) return;
      removeGestureListeners();
      removeGestureListeners = null;
    };

    const ensureNoSleepInstance = async () => {
      if (noSleepRef.current) return noSleepRef.current;
      const mod = await import("nosleep.js");
      const NoSleepCtor = (mod as any).default ?? mod;
      noSleepRef.current = new NoSleepCtor() as NoSleepLike;
      return noSleepRef.current;
    };

    const disableNoSleep = () => {
      if (!noSleepEnabled) return;
      try {
        noSleepRef.current?.disable();
      } catch {
        // no-op
      }
      noSleepEnabled = false;
    };

    const enableNoSleep = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const noSleep = await ensureNoSleepInstance();
        await noSleep.enable();
        noSleepEnabled = true;
        removeNoSleepGestureListeners();
      } catch {
        if (removeGestureListeners) return;
        const onGesture = () => {
          void enableNoSleep();
        };
        const options: AddEventListenerOptions = { passive: true };
        window.addEventListener("pointerdown", onGesture, options);
        window.addEventListener("touchstart", onGesture, options);
        window.addEventListener("click", onGesture, options);
        removeGestureListeners = () => {
          window.removeEventListener("pointerdown", onGesture);
          window.removeEventListener("touchstart", onGesture);
          window.removeEventListener("click", onGesture);
        };
      }
    };

    const requestLock = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (lockRef.current && !lockRef.current.released) return;

      try {
        const sentinel = await nav.wakeLock!.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        lockRef.current = sentinel;
        sentinel.addEventListener?.("release", () => {
          lockRef.current = null;
        });
      } catch {
        // Fallback for browsers where Wake Lock fails or is restricted.
        void enableNoSleep();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        disableNoSleep();
        return;
      }
      if (document.visibilityState === "visible") {
        if (supportsWakeLock) {
          void requestLock();
        } else {
          void enableNoSleep();
        }
      }
    };

    if (supportsWakeLock) {
      void requestLock();
    } else {
      void enableNoSleep();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      removeNoSleepGestureListeners();
      disableNoSleep();

      const activeLock = lockRef.current;
      lockRef.current = null;
      if (activeLock && !activeLock.released) {
        void activeLock.release().catch(() => {
          // no-op
        });
      }
    };
  }, [enabled]);
}
