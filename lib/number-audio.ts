/**
 * Client-only number audio helper for Bingo (1..90).
 *
 * - Assets are expected at: /sounds/numbers/<n>.mp3
 * - Uses Web Audio API (AudioContext + decodeAudioData) for low-latency playback.
 * - Requires a user gesture to unlock audio on many browsers (call `unlockAndPreloadOnUserGesture` or `ensureUnlocked` from a gesture handler).
 * - Persists mute/volume in localStorage.
 */

import { isAudioPlaybackAllowedNow } from "@/lib/audio/foreground";

const BASE_URL = "/sounds/numbers";
const MIN_N = 1;
const MAX_N = 90;

const LS_KEYS = {
  volume: "number_audio_volume",
  muted: "number_audio_muted",
} as const;

type WebAudioContext = AudioContext;

let ctx: WebAudioContext | null = null;
let gain: GainNode | null = null;

let volume = 1;
let muted = false;

let settingsLoaded = false;
let preloadStarted = false;

const bufferCache = new Map<number, AudioBuffer>();
const inflight = new Map<number, Promise<AudioBuffer>>();

function isBrowser() {
  return typeof window !== "undefined";
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 1;
  return Math.max(0, Math.min(1, x));
}

function resolveNumberUrl(n: number) {
  return `${BASE_URL}/${String(n)}.mp3`;
}

function assertValidNumber(n: number) {
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N) {
    throw new Error(`Invalid number for audio: ${n} (expected ${MIN_N}..${MAX_N})`);
  }
}

function loadSettingsOnce() {
  if (settingsLoaded) return;
  settingsLoaded = true;

  if (!isBrowser()) return;

  try {
    const rawVol = window.localStorage.getItem(LS_KEYS.volume);
    const rawMuted = window.localStorage.getItem(LS_KEYS.muted);

    if (rawVol != null) {
      const parsed = Number(rawVol);
      volume = clamp01(parsed);
    }
    if (rawMuted != null) {
      muted = rawMuted === "true";
    }
  } catch {
    // ignore
  }
}

function persistSettings() {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LS_KEYS.volume, String(volume));
    window.localStorage.setItem(LS_KEYS.muted, String(muted));
  } catch {
    // ignore
  }
}

function getOrCreateAudioGraph() {
  loadSettingsOnce();

  if (!isBrowser()) return { ctx: null as any as WebAudioContext, gain: null as any as GainNode };

  if (!ctx) {
    const AnyAudioContext = (window.AudioContext ||
      (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AnyAudioContext) throw new Error("Web Audio API (AudioContext) is not available");
    ctx = new AnyAudioContext();
  }

  if (!gain) {
    gain = ctx.createGain();
    gain.connect(ctx.destination);
  }

  applyGain();
  return { ctx, gain };
}

function applyGain() {
  if (!gain) return;
  gain.gain.value = muted ? 0 : volume;
}

/**
 * Ensures AudioContext is created and resumed. MUST be called from a user gesture
 * (click/touch/pointerdown) in many browsers, otherwise it may reject / remain suspended.
 */
export async function ensureUnlocked() {
  if (!isBrowser()) return;
  const { ctx } = getOrCreateAudioGraph();
  if (ctx.state !== "running") {
    await ctx.resume();
  }
}

async function decodeMp3ToBuffer(url: string): Promise<AudioBuffer> {
  const { ctx } = getOrCreateAudioGraph();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch audio: ${url} (${res.status})`);
  }
  const arr = await res.arrayBuffer();

  // decodeAudioData callback form is legacy; promise form is supported in modern browsers.
  // For safety, we support both.
  const anyCtx = ctx as any;
  if (typeof anyCtx.decodeAudioData === "function" && anyCtx.decodeAudioData.length >= 2) {
    return await new Promise<AudioBuffer>((resolve, reject) => {
      ctx.decodeAudioData(arr, resolve, reject);
    });
  }

  return await ctx.decodeAudioData(arr);
}

async function loadNumberBuffer(n: number): Promise<AudioBuffer> {
  assertValidNumber(n);
  const cached = bufferCache.get(n);
  if (cached) return cached;

  const existing = inflight.get(n);
  if (existing) return existing;

  const p = (async () => {
    const url = resolveNumberUrl(n);
    const buf = await decodeMp3ToBuffer(url);
    bufferCache.set(n, buf);
    return buf;
  })()
    .finally(() => {
      inflight.delete(n);
    });

  inflight.set(n, p);
  return p;
}

function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  const c = Math.max(1, Math.floor(concurrency));
  let idx = 0;
  const runners = Array.from({ length: Math.min(c, items.length) }, async () => {
    while (idx < items.length) {
      const current = items[idx++];
      await worker(current);
    }
  });
  return Promise.all(runners);
}

/**
 * Starts preloading 1..90. Safe to call multiple times; only starts once.
 * Note: If called before unlocking, browsers may still fetch/decode, but some may fail.
 */
export async function preloadNumberAudio() {
  if (!isBrowser()) return;
  if (preloadStarted) return;
  preloadStarted = true;

  const numbers = Array.from({ length: MAX_N - MIN_N + 1 }, (_, i) => i + MIN_N);
  // Keep concurrency moderate to avoid spiky network / CPU.
  await runWithConcurrency(numbers, 6, async (n) => {
    try {
      await loadNumberBuffer(n);
    } catch (e) {
      // Don't fail whole preload; individual files may fail and can be retried on demand.
      console.warn("[number-audio] preload failed for", n, e);
    }
  });
}

/**
 * Convenience: installs a one-time user-gesture handler that will unlock audio
 * and kick off preload in the background.
 */
export function unlockAndPreloadOnUserGesture(target: Document | Window = window) {
  if (!isBrowser()) return () => {};

  let done = false;
  const handler = () => {
    if (done) return;
    done = true;
    // Must be inside the gesture callback
    void ensureUnlocked()
      .then(() => preloadNumberAudio())
      .catch((e) => console.warn("[number-audio] unlock/preload failed:", e));

    target.removeEventListener("pointerdown", handler as any, true);
    target.removeEventListener("click", handler as any, true);
    target.removeEventListener("touchstart", handler as any, true);
  };

  // capture=true so it runs even if UI stops propagation
  target.addEventListener("pointerdown", handler as any, { capture: true, once: true } as any);
  target.addEventListener("click", handler as any, { capture: true, once: true } as any);
  target.addEventListener("touchstart", handler as any, { capture: true, once: true } as any);

  return () => {
    target.removeEventListener("pointerdown", handler as any, true);
    target.removeEventListener("click", handler as any, true);
    target.removeEventListener("touchstart", handler as any, true);
  };
}

export async function playDingTone() {
  if (!isBrowser()) return;
  if (!isAudioPlaybackAllowedNow()) return;

  const { ctx, gain } = getOrCreateAudioGraph();
  try {
    if (ctx.state !== "running") {
      await ctx.resume();
    }
  } catch {
    return;
  }
  if (ctx.state !== "running") return;

  try {
    const oscillator = ctx.createOscillator();
    const dingGain = ctx.createGain();
    oscillator.connect(dingGain);
    dingGain.connect(gain);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";

    dingGain.gain.setValueAtTime(0.3, ctx.currentTime);
    dingGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.warn("[number-audio] playDingTone failed:", e);
  }
}

/**
 * Plays a number (1..90). If the buffer wasn't preloaded yet, it will load on-demand.
 */
export async function playNumber(n: number) {
  if (!isBrowser()) return;
  if (!isAudioPlaybackAllowedNow()) return;
  assertValidNumber(n);

  const { ctx, gain } = getOrCreateAudioGraph();
  // In some browsers this may still be suspended if user didn't gesture.
  if (ctx.state !== "running") {
    // Don't throw; just attempt resume.
    try {
      await ctx.resume();
    } catch {
      // ignore
    }
  }

  let buf: AudioBuffer;
  try {
    buf = await loadNumberBuffer(n);
  } catch (e) {
    console.warn("[number-audio] playNumber load failed:", n, e);
    return;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(gain);
  src.start(0);
}

export function setVolume(nextVolume: number) {
  loadSettingsOnce();
  volume = clamp01(nextVolume);
  applyGain();
  persistSettings();
}

export function setMuted(nextMuted: boolean) {
  loadSettingsOnce();
  muted = Boolean(nextMuted);
  applyGain();
  persistSettings();
}

// Optional helpers (useful for UI later)
export function getVolume() {
  loadSettingsOnce();
  return volume;
}

export function isMuted() {
  loadSettingsOnce();
  return muted;
}


