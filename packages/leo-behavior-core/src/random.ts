export function defaultRandom(): number {
  return Math.random();
}

export function randomInt(min: number, max: number, random: () => number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(random() * (hi - lo + 1));
}

export function randomFloat(min: number, max: number, random: () => number): number {
  return min + random() * (max - min);
}
