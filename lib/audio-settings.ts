/**
 * Simple client-side persisted audio settings (localStorage).
 *
 * This file is intentionally UI/framework-agnostic; consumers can read on mount
 * and write on user interaction.
 */

const LS_KEYS = {
  musicVolume: "music_volume",
  musicEnabled: "music_enabled",
  legacyGameRoomMusicEnabled: "gameroom_music_enabled",
  dingEnabled: "ding_sound_enabled",
  masterMuted: "master_muted",
  previousMusicVolume: "previous_music_volume",
  previousNumbersMuted: "previous_numbers_muted",
  previousDingEnabled: "previous_ding_enabled",
} as const;

const DEFAULT_MUSIC_VOLUME = 0.15;

function isBrowser() {
  return typeof window !== "undefined";
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 1;
  return Math.max(0, Math.min(1, x));
}

export function getMusicVolume(): number {
  if (!isBrowser()) return DEFAULT_MUSIC_VOLUME;
  try {
    const raw = window.localStorage.getItem(LS_KEYS.musicVolume);
    if (raw == null) return DEFAULT_MUSIC_VOLUME;
    return clamp01(Number(raw));
  } catch {
    return DEFAULT_MUSIC_VOLUME;
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

export function isMusicEnabled(): boolean {
  if (!isBrowser()) return true;
  try {
    const raw = window.localStorage.getItem(LS_KEYS.musicEnabled);
    if (raw != null) return raw === "true";

    // Backward compatibility with older key.
    const legacy = window.localStorage.getItem(LS_KEYS.legacyGameRoomMusicEnabled);
    if (legacy != null) return legacy === "true";
    return true;
  } catch {
    return true;
  }
}

export function setMusicEnabled(enabled: boolean) {
  if (!isBrowser()) return;
  const value = String(Boolean(enabled));
  try {
    window.localStorage.setItem(LS_KEYS.musicEnabled, value);
    // Keep legacy key in sync to avoid split behavior during rollout.
    window.localStorage.setItem(LS_KEYS.legacyGameRoomMusicEnabled, value);
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

export function isMasterMuted(): boolean {
  if (!isBrowser()) return false;
  try {
    const raw = window.localStorage.getItem(LS_KEYS.masterMuted);
    if (raw == null) return false;
    return raw === "true";
  } catch {
    return false;
  }
}

export function setMasterMuted(muted: boolean) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LS_KEYS.masterMuted, String(Boolean(muted)));
  } catch {
    // ignore
  }
}

export function getPreviousMusicVolume(): number | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(LS_KEYS.previousMusicVolume);
    if (raw == null) return null;
    return clamp01(Number(raw));
  } catch {
    return null;
  }
}

export function setPreviousMusicVolume(v: number) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LS_KEYS.previousMusicVolume, String(clamp01(v)));
  } catch {
    // ignore
  }
}

export function getPreviousNumbersMuted(): boolean | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(LS_KEYS.previousNumbersMuted);
    if (raw == null) return null;
    return raw === "true";
  } catch {
    return null;
  }
}

export function setPreviousNumbersMuted(muted: boolean) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LS_KEYS.previousNumbersMuted, String(Boolean(muted)));
  } catch {
    // ignore
  }
}

export function getPreviousDingEnabled(): boolean | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(LS_KEYS.previousDingEnabled);
    if (raw == null) return null;
    return raw === "true";
  } catch {
    return null;
  }
}

export function setPreviousDingEnabled(enabled: boolean) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LS_KEYS.previousDingEnabled, String(Boolean(enabled)));
  } catch {
    // ignore
  }
}


