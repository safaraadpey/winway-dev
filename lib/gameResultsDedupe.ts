export type GameEndStatus = "settling" | "finished";

type SeenState = Record<string, number>; // key -> timestamp(ms)

const STORAGE_KEY = "winway_game_results_seen_v1";
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

function shownOnceKeyForUser(userId: string) {
  return `winway_game_results_shown_once_v1::${userId}`;
}

function safeParse(json: string | null): SeenState {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SeenState;
  } catch {
    return {};
  }
}

function prune(state: SeenState, nowMs: number): SeenState {
  const next: SeenState = {};
  for (const [k, ts] of Object.entries(state)) {
    if (typeof ts !== "number") continue;
    if (nowMs - ts > MAX_AGE_MS) continue;
    next[k] = ts;
  }
  return next;
}

function readState(): SeenState {
  if (typeof window === "undefined") return {};
  const raw = window.sessionStorage?.getItem(STORAGE_KEY) ?? null;
  const now = Date.now();
  const pruned = prune(safeParse(raw), now);
  // Best-effort write-back (keeps storage small)
  try {
    window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // ignore
  }
  return pruned;
}

function writeState(state: SeenState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function buildGameResultsKey(params: {
  roomName: string; // short-term unique per your assumption
  status: GameEndStatus;
  finishedAtHint?: string | number | null; // updated_at/ends_at/commit_timestamp
}): string {
  const room = (params.roomName || "").trim();
  const status = params.status;
  const hintRaw = params.finishedAtHint ?? "";
  const hint = String(hintRaw).trim();
  // Keep it human-debuggable and stable
  return `${room}::${status}::${hint}`;
}

export function hasSeenGameResults(key: string): boolean {
  const state = readState();
  return Boolean(state[key]);
}

export function markSeenGameResults(key: string): void {
  const now = Date.now();
  const current = readState();
  const next = prune({ ...current, [key]: now }, now);
  writeState(next);
}

/**
 * Hard guard: show results popup only once per player per browser session.
 * This is intentionally coarse to prevent repeated popups after closing.
 */
export function hasShownGameResultsOnceForUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage?.getItem(shownOnceKeyForUser(userId)) === "1";
  } catch {
    return false;
  }
}

export function markShownGameResultsOnceForUser(userId: string | null | undefined): void {
  if (!userId) return;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(shownOnceKeyForUser(userId), "1");
  } catch {
    // ignore
  }
}


