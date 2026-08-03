/**
 * Money / rounding primitives.
 *
 * These mirror the exact rounding semantics used by the Postgres business logic
 * so that amounts computed in the engine are byte-for-byte compatible with the
 * values the DB functions would have written.
 *
 * Source semantics:
 *  - Postgres `CEIL(numeric)`  → smallest integer >= value (used by commission).
 *  - Postgres `ROUND(numeric, 2)` → round half AWAY FROM ZERO to 2 decimals
 *    (used by prize-pool split in game_finance.fn_finish_room_and_settle).
 *
 * All production amounts handled here are non-negative, so half-away-from-zero
 * and half-up coincide; we still implement away-from-zero to stay faithful.
 */

/** Postgres CEIL(numeric) — smallest integer not less than `value`. */
export function ceilInt(value: number): number {
  return Math.ceil(roundForFloatNoise(value));
}

/**
 * Postgres ROUND(numeric, scale) with round-half-away-from-zero.
 * Defaults to scale=2 (currency sub-units) as used in settlement.
 */
export function roundTo(value: number, scale = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** scale;
  const scaled = roundForFloatNoise(value * factor);
  const rounded =
    scaled >= 0
      ? Math.floor(scaled + 0.5)
      : Math.ceil(scaled - 0.5);
  return rounded / factor;
}

/** Convenience alias matching the SQL call `ROUND(x, 2)`. */
export function round2(value: number): number {
  return roundTo(value, 2);
}

/** GREATEST(value, 0) — clamp negatives to zero. */
export function atLeastZero(value: number): number {
  return value > 0 ? value : 0;
}

/**
 * IEEE-754 multiplication can leave artefacts like 12.000000000000002.
 * Snap to a high precision before applying ceil/floor so rounding matches the
 * exact-decimal arithmetic Postgres `numeric` performs.
 */
function roundForFloatNoise(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}
