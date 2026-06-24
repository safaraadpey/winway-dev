"use client";

import { useEffect } from "react";

const LOCKED_ROOT_FONT_SIZE_PX = 16;

function applyTextScalingLock(): void {
  const root = document.documentElement;
  const body = document.body;

  root.style.fontSize = `${LOCKED_ROOT_FONT_SIZE_PX}px`;
  root.style.setProperty("-webkit-text-size-adjust", "none");
  root.style.setProperty("-moz-text-size-adjust", "none");
  root.style.setProperty("text-size-adjust", "none");

  if (body) {
    body.style.setProperty("-webkit-text-size-adjust", "none");
    body.style.setProperty("-moz-text-size-adjust", "none");
    body.style.setProperty("text-size-adjust", "none");
  }
}

/**
 * Re-applies global text scaling locks after mount and on viewport changes.
 * CSS in globals.css is the primary guard; this covers late WebView/PWA overrides.
 */
export default function TextScalingGuard() {
  useEffect(() => {
    applyTextScalingLock();

    window.addEventListener("orientationchange", applyTextScalingLock);
    window.addEventListener("resize", applyTextScalingLock);
    document.addEventListener("visibilitychange", applyTextScalingLock);

    return () => {
      window.removeEventListener("orientationchange", applyTextScalingLock);
      window.removeEventListener("resize", applyTextScalingLock);
      document.removeEventListener("visibilitychange", applyTextScalingLock);
    };
  }, []);

  return null;
}
