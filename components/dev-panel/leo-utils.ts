"use client";

import type { LeoBehaviorProfile, LeoStakeTier, LeoTimeBand } from "@/src/types/leo";
import { LEO_PROFILE_LABELS, LEO_STAKE_LABELS, LEO_TIME_BAND_LABELS } from "@/src/types/leo";
import {
  LEO_HEAVY_TABLE_MIN_PRICE,
  LEO_LIGHT_TABLE_MAX_PRICE,
  LEO_STAKE_TIERS,
  stakeTierFromPrice,
} from "@dingmoney/leo-behavior-core";

export { LEO_HEAVY_TABLE_MIN_PRICE, LEO_LIGHT_TABLE_MAX_PRICE, LEO_STAKE_TIERS, stakeTierFromPrice };

export function formatLeoScheduleTime(iso: string): string {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function profileLabel(profile: LeoBehaviorProfile): string {
  return LEO_PROFILE_LABELS[profile].title;
}

export function bandLabel(band: LeoTimeBand): string {
  return LEO_TIME_BAND_LABELS[band];
}

export function stakeLabel(tier: LeoStakeTier): string {
  return LEO_STAKE_LABELS[tier];
}

export const ALL_TIME_BANDS: LeoTimeBand[] = [
  "midnight",
  "dawn",
  "morning",
  "noon",
  "afternoon",
  "evening",
];

export const ALL_STAKE_TIERS: LeoStakeTier[] = [...LEO_STAKE_TIERS];

export const ALL_PROFILES: LeoBehaviorProfile[] = [
  "methodical",
  "emotional",
  "hot_hand",
  "distracted",
  "cautious",
];
