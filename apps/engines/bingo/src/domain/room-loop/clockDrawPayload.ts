import type { DrawPersistencePayload } from "../draw/evaluateDraw.js";
import type { DingCreditsPayload } from "../ding/index.js";

/** Immutable draw payload stamped by the RAM clock — Persist must not retime or re-eval. */
export interface ClockDrawPayload {
  /** Monotonic draw order in this room (1-based count after pick). */
  seq: number;
  number: number;
  /** Clock time when the ball was picked → p_now / draws.created_at */
  drawnAtIso: string;
  /** RAM due time for this ball */
  actorDueAtIso: string;
  /** Next ball due from drawnAt (interval + jitter) → p_next_draw_at */
  nextDueAtIso: string;
  persistence: DrawPersistencePayload;
  ding: DingCreditsPayload;
  fullWinnerThisDraw: boolean;
}

export function assertClockTimestamps(payload: ClockDrawPayload): void {
  if (!payload.drawnAtIso?.trim()) {
    throw new Error("ClockDrawPayload.drawnAtIso is required");
  }
  if (!payload.nextDueAtIso?.trim()) {
    throw new Error("ClockDrawPayload.nextDueAtIso is required");
  }
}
