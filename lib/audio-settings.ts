/**
 * Simple client-side persisted audio settings (localStorage).
 *
 * This file is intentionally UI/framework-agnostic; consumers can read on mount
 * and write on user interaction.
 */

const LS_KEYS = {
  musicVolume: "music_volume",
  dingEnabled: "ding_sound_enabled",
} as const;

function isBrowser() {
  return typeof window !== "undefined";
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 1;
  return Math.max(0, Math.min(1, x));
}

export function getMusicVolume(): number {
  if (!isBrowser()) return 1;
  try {
    const raw = window.localStorage.getItem(LS_KEYS.musicVolume);
    if (raw == null) return 1;
    return clamp01(Number(raw));
  } catch {
    return 1;
  }
}

export function setMusicVolume(v: number) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LS_KEYS.musicVolume, String(clamp01(v)));
  } catch {
    // ignore
  }
}

export function isDingEnabled(): boolean {
  if (!isBrowser()) return true;
  try {
    const raw = window.localStorage.getItem(LS_KEYS.dingEnabled);
    if (raw == null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

export function setDingEnabled(enabled: boolean) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LS_KEYS.dingEnabled, String(Boolean(enabled)));
  } catch {
    // ignore
  }
}


