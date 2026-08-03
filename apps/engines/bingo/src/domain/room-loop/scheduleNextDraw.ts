/**
 * Draw-cadence policy for the room-actor loop.
 *
 * Mirrors the scheduler path: first draw FIRST_DRAW_DELAY_SEC after the room
 * starts playing, then every draw_interval_sec (with stable per-room jitter so
 * concurrent rooms don't all fire on the same tick).
 */
import { addSecondsWithJitter } from "../room/drawScheduleJitter.js";
import type { RoomRow } from "../../repositories/types.js";

export const FIRST_DRAW_DELAY_SEC = 7;
const DEFAULT_DRAW_INTERVAL_SEC = 3;

export function drawIntervalSec(meta: Record<string, unknown> | null): number {
  const raw = meta?.["draw_interval_sec"];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Math.max(
    Number.isFinite(n) ? Math.trunc(n) : DEFAULT_DRAW_INTERVAL_SEC,
    1
  );
}

/** next_draw_at for the ball after the one just inserted at `from`. */
export function nextDrawAtIso(room: RoomRow, from: Date): string {
  return addSecondsWithJitter(from, drawIntervalSec(room.meta), room.id);
}

/** Milliseconds until `nextDrawAtIso`; 0 when already due (or unset). */
export function msUntilDue(nextDrawAt: string | null, now = Date.now()): number {
  if (!nextDrawAt) return 0;
  return Math.max(0, Date.parse(nextDrawAt) - now);
}

/**
 * Delay before the next draw tick after one completes.
 * Overlaps eval/finalize time with the draw interval so cadence is not
 * interval + processing (avoids the extra fixed 1s sleep).
 */
export function cadenceDelayMs(
  nextDrawAtIso: string | null,
  now = Date.now()
): number {
  return msUntilDue(nextDrawAtIso, now);
}
