export function isAudioPlaybackAllowedNow(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  if (document.visibilityState !== "visible") {
    return false;
  }

  if (typeof document.hasFocus === "function" && !document.hasFocus()) {
    return false;
  }

  return true;
}

