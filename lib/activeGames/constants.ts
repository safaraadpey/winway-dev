/** Fallback poll when realtime misses (non-empty active room list). */
export const ACTIVE_GAMES_POLL_MS = 18_000;

/** Heavy backoff when the player has no active rooms. */
export const ACTIVE_GAMES_EMPTY_BACKOFF_MS = [60_000, 120_000, 300_000] as const;

export const ACTIVE_ROOM_STATUSES = new Set([
  "waiting",
  "playing",
  "live",
  "settling",
]);

export const ACTIVE_ROOM_STATUS_ORDER: Record<
  "waiting" | "playing" | "live" | "settling",
  number
> = {
  live: 0,
  playing: 1,
  waiting: 2,
  settling: 3,
};
