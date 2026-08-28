/**
 * Deterministic RNG from a string seed and turn counter.
 * Used for easy/medium AI randomness — must match on client and server replay.
 */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createTurnRng(seed: string, turnIndex: number): () => number {
  let state = (hashSeed(`${seed}:${turnIndex}`) + 0x9e3779b9) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickRandomIndex(rng: () => number, length: number): number {
  if (length <= 0) return 0;
  return Math.floor(rng() * length);
}
