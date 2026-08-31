import { getProfilePreset } from "./profilePresets";
import { randomInt } from "./random";
import type { LeoBehaviorProfile, LeoTablePoolSource } from "./types";

export function selectTemplateFromPool(
  pool: string[],
  random: () => number
): string | null {
  if (pool.length === 0) return null;
  const index = Math.floor(random() * pool.length);
  return pool[index] ?? null;
}

export function getPoolForSource(
  tablePoolSource: LeoTablePoolSource,
  preferredTemplateIds: string[],
  randomTemplateIds: string[]
): string[] {
  return tablePoolSource === "preferred" ? preferredTemplateIds : randomTemplateIds;
}

/** Cap concurrent joins: explicit maxConcurrentTables (0 = use full pool size). */
export function resolveConcurrentTableCap(
  poolSize: number,
  maxConcurrentTables: number
): number {
  if (poolSize <= 0) return 0;
  if (maxConcurrentTables > 0) return Math.min(maxConcurrentTables, poolSize);
  return poolSize;
}

export function pickConcurrentTableCount(
  profile: LeoBehaviorProfile,
  poolCap: number,
  random: () => number
): number {
  if (poolCap <= 0) return 0;
  const preset = getProfilePreset(profile);
  const min = Math.min(preset.concurrentTablesPerRound.min, poolCap);
  const max = Math.min(preset.concurrentTablesPerRound.max, poolCap);
  return randomInt(Math.max(1, min), Math.max(1, max), random);
}

/** Pick up to `count` distinct template ids from pool (shuffle sample). */
export function selectDistinctTemplatesFromPool(
  pool: string[],
  count: number,
  random: () => number
): string[] {
  if (pool.length === 0 || count <= 0) return [];
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export type SelectTableForSessionInput = {
  tablePoolSource: LeoTablePoolSource;
  preferredTemplateIds: string[];
  randomTemplateIds: string[];
  random: () => number;
};

/**
 * Picks a template from the session's assigned pool (preferred OR random).
 * Does not fall back across pools — caller must assign pool per session.
 */
export function selectTableForSession(input: SelectTableForSessionInput): string | null {
  const pool = getPoolForSource(
    input.tablePoolSource,
    input.preferredTemplateIds,
    input.randomTemplateIds
  );
  return selectTemplateFromPool(pool, input.random);
}

export type SelectConcurrentTablesInput = SelectTableForSessionInput & {
  behaviorProfile: LeoBehaviorProfile;
  maxConcurrentTables: number;
};

export function selectConcurrentTablesForRound(
  input: SelectConcurrentTablesInput
): { templateIds: string[]; tableCount: number } {
  const pool = getPoolForSource(
    input.tablePoolSource,
    input.preferredTemplateIds,
    input.randomTemplateIds
  );
  const poolCap = resolveConcurrentTableCap(pool.length, input.maxConcurrentTables);
  const tableCount = pickConcurrentTableCount(input.behaviorProfile, poolCap, input.random);
  const templateIds = selectDistinctTemplatesFromPool(pool, tableCount, input.random);
  return { templateIds, tableCount: templateIds.length };
}
