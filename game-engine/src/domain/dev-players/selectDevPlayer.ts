import type { DevPlayerConfigSnapshot } from "./types.js";
import { pickRandom } from "./random.js";

/**
 * Pick a dev player excluding user ids (occupied, already scheduled this cycle, etc.).
 * Does not reuse excluded players — returns null when none left.
 */
export function pickDevPlayerForJoin(
  candidates: DevPlayerConfigSnapshot[],
  excludedUserIds: Set<string>
): DevPlayerConfigSnapshot | null {
  if (candidates.length === 0) return null;
  const available = candidates.filter((player) => !excludedUserIds.has(player.userId));
  return pickRandom(available);
}
