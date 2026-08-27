import type { RoomTemplateSnapshot } from "./types.js";

export interface ProfilePriceSource {
  allowedPrices: number[];
}

export function unionAllowedPricesFromProfiles(profiles: ProfilePriceSource[]): number[] {
  const prices = new Set<number>();
  for (const profile of profiles) {
    for (const price of profile.allowedPrices) {
      if (Number.isFinite(price)) prices.add(price);
    }
  }
  return Array.from(prices).sort((a, b) => a - b);
}

export function filterTemplatesByAllowedPrices(
  templates: RoomTemplateSnapshot[],
  allowedPrices: number[]
): RoomTemplateSnapshot[] {
  const priceSet = new Set(allowedPrices);
  return templates.filter((template) => priceSet.has(template.price));
}
