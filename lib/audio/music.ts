/**
 * Client-only background music for LiveRoom screen.
 *
 * - Uses a single shared HTMLAudioElement (no AudioContext)
 * - Music file: /sounds/music/live.mp3
 * - Loops seamlessly
 * - Requires user gesture to unlock (one-time global pointerdown listener)
 * - Default volume: 0.22
 * - Persists volume in localStorage via audio-settings.ts
 * - Does NOT restart/recreate on re-renders
 */

"use client";

import { getMusicVolume, setMusicVolume } from "@/lib/audio-settings";

const MUSIC_URL = "/sounds/music/live.mp3";
const DEFAULT_VOLUME = 0.15;

let audio: HTMLAudioElement | null = null;
let unlockHandlerInstalled = false;
let isPlaying = false;
let storageListenerInstalled = false;
let foregroundListenersInstalled = false;
let shouldBePlaying = false;

function isBrowser() {
  return typeof window !== "undefined";
}

function syncVolumeFromStorage() {
  if (!audio) return;
  const savedVolume = getMusicVolume();
  const volumeToUse = savedVolume !== 1 ? savedVolume : DEFAULT_VOLUME;
  audio.volume = volumeToUse;
}

function canPlayInForeground() {
  if (!isBrowser()) return false;
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible" && document.hasFocus();
}

function installStorageListener() {
  if (!isBrowser()) return;
  if (storageListenerInstalled) return;
  storageListenerInstalled = true;

  // Listen for storage changes (works across tabs/windows)
  const onStorageChange = (e: StorageEvent) => {
    if (e.key === "music_volume") {
      syncVolumeFromStorage();
    }
  };
  window.addEventListener("storage", onStorageChange);
}

function pauseForBackground() {
  if (!audio) return;
  if (audio.paused) return;
  audio.pause();
  isPlaying = false;
}

function tryPlayIfAllowed() {
  const a = getOrCreateAudio();
  if (!a) return;
  if (!shouldBePlaying) return;
  if (!canPlayInForeground()) {
    pauseForBackground();
    return;
  }
  if (isPlaying && !a.paused) return;

  void a.play()
    .then(() => {
      isPlaying = true;
    })
    .catch((err) => {
      // May fail until first gesture unlocks media playback
      console.debug("[music] Play failed (will retry after gesture):", err);
    });
}

function installForegroundListeners() {
  if (!isBrowser()) return;
  if (foregroundListenersInstalled) return;
  foregroundListenersInstalled = true;

  const onVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      pauseForBackground();
      return;
    }
    tryPlayIfAllowed();
  };

  const onBlur = () => {
    pauseForBackground();
  };

  const onFocus = () => {
    tryPlayIfAllowed();
  };

  const onPageHide = () => {
    pauseForBackground();
  };

  const onPageShow = () => {
    tryPlayIfAllowed();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
}

function getOrCreateAudio(): HTMLAudioElement | null {
  if (!isBrowser()) return null;

  if (!audio) {
    audio = new Audio(MUSIC_URL);
    audio.loop = true;
    audio.preload = "auto";
    
    // Set initial volume from localStorage or default
    const savedVolume = getMusicVolume();
    const initialVolume = savedVolume !== 1 ? savedVolume : DEFAULT_VOLUME;
    audio.volume = initialVolume;
    
    // If localStorage had default (1), persist the new default (0.22)
    if (savedVolume === 1) {
      setMusicVolume(DEFAULT_VOLUME);
    }

    // Install storage listener once
    installStorageListener();

    // Handle errors gracefully
    audio.addEventListener("error", (e) => {
      console.warn("[music] Audio error:", e);
    });
  } else {
    // Sync volume whenever audio is accessed (in case it changed in same tab)
    syncVolumeFromStorage();
  }

  return audio;
}

/**
 * Installs a one-time global pointerdown listener to unlock audio playback.
 * Safe to call multiple times; only installs once.
 */
function installUnlockHandler() {
  if (!isBrowser()) return;
  if (unlockHandlerInstalled) return;
  unlockHandlerInstalled = true;

  const handler = () => {
    const a = getOrCreateAudio();
    if (!a) return;

    // Attempt to play to unlock audio (will fail silently if not allowed)
    // After first gesture, browser will allow subsequent plays
    void a.play().catch(() => {
      // Expected before first gesture - will work after gesture
    });
  };

  // Use capture phase with once:true to catch first gesture and auto-remove
  window.addEventListener("pointerdown", handler, { capture: true, once: true } as any);
  window.addEventListener("click", handler, { capture: true, once: true } as any);
  window.addEventListener("touchstart", handler, { capture: true, once: true } as any);
}

/**
 * Starts playing the LiveRoom background music.
 * Music will only actually start after the first user gesture (pointerdown).
 * Safe to call multiple times; won't restart if already playing.
 */
export function playLiveRoomMusic() {
  if (!isBrowser()) return;

  const a = getOrCreateAudio();
  if (!a) return;

  // Install unlock handler if not already done
  installUnlockHandler();
  installForegroundListeners();
  shouldBePlaying = true;

  // Try to play only when app/tab is currently visible and focused.
  tryPlayIfAllowed();
}

/**
 * Stops the LiveRoom background music.
 * Safe to call multiple times.
 */
export function stopLiveRoomMusic() {
  if (!isBrowser()) return;

  const a = getOrCreateAudio();
  if (!a) return;

  shouldBePlaying = false;
  a.pause();
  a.currentTime = 0; // Reset to start for next play
  isPlaying = false;
}

/**
 * Sets the music volume (0.0 to 1.0).
 * Updates the audio element and persists to localStorage.
 * This is called by SoundControlsPopup when user adjusts the slider.
 */
export function setMusicVolumeValue(volume: number) {
  if (!isBrowser()) return;

  const clamped = Math.max(0, Math.min(1, volume));
  
  // Persist to localStorage (SoundControlsPopup also does this, but safe to do twice)
  setMusicVolume(clamped);

  // Update audio element if it exists
  const a = getOrCreateAudio();
  if (a) {
    a.volume = clamped;
  }
}

/**
 * Gets the current music volume (0.0 to 1.0).
 */
export function getMusicVolumeValue(): number {
  if (!isBrowser()) return DEFAULT_VOLUME;
  
  const a = getOrCreateAudio();
  if (a) {
    return a.volume;
  }
  
  return getMusicVolume() !== 1 ? getMusicVolume() : DEFAULT_VOLUME;
}

