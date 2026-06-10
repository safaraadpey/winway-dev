import type { DevPlayerConfigSnapshot } from "./types.js";
import { pickRandom } from "./random.js";

/** Prefer dev players not currently seated in waiting/playing rooms. */
export function pickDevPlayerForJoin(
  candidates: DevPlayerConfigSnapshot[],
  occupiedDevPlayerIds: Set<string>
): DevPlayerConfigSnapshot | null {
  if (candidates.length === 0) return null;

  const unused = candidates.filter((player) => !occupiedDevPlayerIds.has(player.userId));
  return pickRandom(unused.length > 0 ? unused : candidates);
}
