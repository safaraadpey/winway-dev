/**
 * Stagger tournament room creation so tables are not seated in one burst.
 *
 * Engine env TOURNAMENT_ROOM_CREATE_STAGGER_SEC is the default; a tournament
 * may override via meta.room_create_stagger_seconds. 0 disables stagger and
 * seats every table in a single tick (legacy behavior).
 */

export const TOURNAMENT_ROOM_CREATE_STAGGER_SEC_DEFAULT = 3;
export const TOURNAMENT_ROOM_CREATE_STAGGER_SEC_MAX = 120;

export function clampRoomCreateStaggerSec(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(Math.floor(raw), TOURNAMENT_ROOM_CREATE_STAGGER_SEC_MAX);
}

/**
 * Per-tournament meta wins when present and numeric; otherwise engine default.
 */
export function resolveRoomCreateStaggerSec(
  engineDefault: number,
  meta: Record<string, unknown> | null
): number {
  const raw = meta?.["room_create_stagger_seconds"];
  if (raw !== null && raw !== undefined && `${raw}`.trim() !== "") {
    const n = Number.parseInt(`${raw}`, 10);
    if (Number.isFinite(n)) return clampRoomCreateStaggerSec(n);
  }
  return clampRoomCreateStaggerSec(engineDefault);
}

export interface RoundSeatSnapshot {
  /** 0 when no round rows exist yet. */
  roundNo: number;
  tableCount: number;
  unseatedCount: number;
  lastRoomCreatedAtMs: number | null;
}

/**
 * How many *new* rooms to create this tick.
 * `null` = unlimited (stagger off — seat every remaining table).
 * `0` = sync/complete only, do not seat.
 * `1` = seat the next unseated table.
 */
export function nextRoomCreateBudget(
  staggerSec: number,
  snapshot: RoundSeatSnapshot,
  nowMs: number
): number | null {
  if (staggerSec <= 0) return null;
  if (snapshot.roundNo <= 0) return 1;
  if (snapshot.unseatedCount <= 0) return 0;
  if (snapshot.lastRoomCreatedAtMs == null) return 1;
  const elapsedMs = nowMs - snapshot.lastRoomCreatedAtMs;
  if (elapsedMs >= staggerSec * 1000) return 1;
  return 0;
}
