export const LEO_STAKE_TIERS = ["light", "medium", "heavy"] as const;

export type LeoStakeTier = (typeof LEO_STAKE_TIERS)[number];

/** Same thresholds as Leo template multi-select (سبک / متوسط / سنگین). */
export const LEO_LIGHT_TABLE_MAX_PRICE = 50_000;
export const LEO_HEAVY_TABLE_MIN_PRICE = 200_000;

export function isLeoStakeTier(value: string): value is LeoStakeTier {
  return (LEO_STAKE_TIERS as readonly string[]).includes(value);
}

export function stakeTierFromPrice(price: number): LeoStakeTier {
  if (price < LEO_LIGHT_TABLE_MAX_PRICE) return "light";
  if (price < LEO_HEAVY_TABLE_MIN_PRICE) return "medium";
  return "heavy";
}

export function filterTemplateIdsByStakeTiers(
  templateIds: string[],
  allowedTiers: ReadonlySet<LeoStakeTier>,
  priceByTemplateId: ReadonlyMap<string, number>
): string[] {
  if (allowedTiers.size === 0) return [];
  return templateIds.filter((id) => {
    const price = priceByTemplateId.get(id);
    if (price == null) return false;
    return allowedTiers.has(stakeTierFromPrice(price));
  });
}

export function stakeTiersForTemplateIds(
  templateIds: string[],
  priceByTemplateId: ReadonlyMap<string, number>
): Set<LeoStakeTier> {
  const tiers = new Set<LeoStakeTier>();
  for (const id of templateIds) {
    const price = priceByTemplateId.get(id);
    if (price == null) continue;
    tiers.add(stakeTierFromPrice(price));
  }
  return tiers;
}
