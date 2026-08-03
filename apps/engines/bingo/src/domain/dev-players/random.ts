import { randomInt } from "node:crypto";

export function randomIntInclusive(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return randomInt(lo, hi + 1);
}

export function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[randomInt(0, items.length)] ?? null;
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    const tmp = copy[i];
    copy[i] = copy[j]!;
    copy[j] = tmp!;
  }
  return copy;
}
