/**
 * Provably-fair RNG — faithful port of the deterministic seed ordering used by
 * the database engine.
 *
 * Source of truth:
 *  - game_core.fn_generate_room_seed()        → 32 random bytes + sha256 hex hash
 *  - game_core.fn_manage_room_live_actions()  → next number is chosen by ordering
 *      the not-yet-drawn candidates 1..90 by:
 *          digest(encode(room_seed,'hex') || ':' || n::text, 'sha256')
 *      ascending, taking the first.
 *
 * The same `sha256(hex(seed) || ':' || key)` ordering pattern is used for card
 * dealing in game_core.fn_join_or_create_room_core (key = card identifier).
 *
 * Reproducing the byte ordering exactly is what makes the engine's draws
 * verifiable against the published `room_seed_hash` (provably fair).
 */

import { createHash } from "node:crypto";

export const BINGO_MIN = 1;
export const BINGO_MAX = 90;

/** sha256 hex of a buffer — matches encode(digest(x,'sha256'),'hex'). */
export function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Commit hash published at room creation: sha256(seed) as 64-char hex. */
export function seedHash(seed: Buffer): string {
  return sha256Hex(seed);
}

/**
 * Ordering key for a candidate, identical to the SQL expression:
 *   digest(encode(room_seed,'hex') || ':' || key, 'sha256')
 * Returned as a lowercase hex string so lexicographic comparison matches
 * Postgres `bytea`/digest ordering (hex compares the same as raw bytes).
 */
export function orderingKey(seed: Buffer, key: string): string {
  const seedHex = seed.toString("hex");
  return sha256Hex(`${seedHex}:${key}`);
}

/**
 * Pick the next bingo number (1..90) for a room given the seed and the set of
 * numbers already drawn. Returns null when every number is exhausted (the room
 * is then finished — same as the SQL `IF v_next IS NULL THEN ... finished`).
 *
 * Faithful to fn_manage_room_live_actions: candidates are the numbers NOT yet
 * present in draws, ordered ascending by the sha256 ordering key, first wins.
 */
export function pickNextNumber(
  seed: Buffer,
  alreadyDrawn: Iterable<number>
): number | null {
  const drawn = new Set<number>(alreadyDrawn);
  let best: { n: number; key: string } | null = null;

  for (let n = BINGO_MIN; n <= BINGO_MAX; n++) {
    if (drawn.has(n)) continue;
    const key = orderingKey(seed, String(n));
    if (best === null || key < best.key) {
      best = { n, key };
    }
  }

  return best ? best.n : null;
}

/**
 * Deterministic ordering of an arbitrary candidate list by the same provably
 * fair key (used for card dealing). Returns a new sorted array; ties broken by
 * the original key string exactly as Postgres ORDER BY digest(...) would.
 */
export function orderBySeed<T>(
  seed: Buffer,
  candidates: readonly T[],
  keyOf: (candidate: T) => string
): T[] {
  return [...candidates]
    .map((c) => ({ c, k: orderingKey(seed, keyOf(c)) }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map((x) => x.c);
}
