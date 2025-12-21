"use client";

/**
 * Lightweight network trace helper (DEV-only, opt-in via localStorage).
 *
 * Enable:
 *   localStorage.setItem("NET_TRACE", "1")
 * Disable:
 *   localStorage.removeItem("NET_TRACE")
 */
export function traceFetch(label: string, meta?: Record<string, any>) {
  if (process.env.NODE_ENV !== "development") return;
  if (typeof window === "undefined") return;

  let enabled = false;
  try {
    enabled = window.localStorage?.getItem("NET_TRACE") === "1";
  } catch {
    enabled = false;
  }
  if (!enabled) return;

  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.groupCollapsed(`[NET_TRACE] ${label}`, { id });
  if (meta) console.log("meta", meta);
  console.trace("stack");
  console.groupEnd();
}


