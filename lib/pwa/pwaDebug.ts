/** Verbose [PWA] logs in development or when localStorage winway_pwa_debug=1 */
export function isPwaDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  try {
    return window.localStorage.getItem("winway_pwa_debug") === "1";
  } catch {
    return false;
  }
}

export function logPwa(message: string, detail?: Record<string, unknown>): void {
  if (!isPwaDebugEnabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    console.info(`[PWA] ${message}`, detail);
  } else {
    console.info(`[PWA] ${message}`);
  }
}
