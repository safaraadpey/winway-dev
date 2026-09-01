import {
  LEO_BEHAVIOR_PROFILES,
  LEO_STAKE_TIERS,
  LEO_TIME_BANDS,
  isLeoStakeTier,
} from "@dingmoney/leo-behavior-core";
import type { LeoSaveUserConfigPayload, LeoStakeTier, LeoTimeBand } from "@/src/types/leo";

export function parseLeoUserConfigPayload(body: unknown): LeoSaveUserConfigPayload {
  const raw = body as Record<string, unknown>;
  const activeTimeBands = Array.isArray(raw?.activeTimeBands)
    ? (raw.activeTimeBands as string[]).filter((band): band is LeoTimeBand =>
        LEO_TIME_BANDS.includes(band as LeoTimeBand)
      )
    : [];

  const behaviorProfile = String(raw?.behaviorProfile ?? "methodical");
  if (!LEO_BEHAVIOR_PROFILES.includes(behaviorProfile as (typeof LEO_BEHAVIOR_PROFILES)[number])) {
    throw new Error("invalid behavior profile");
  }

  return {
    isEnabled: Boolean(raw?.isEnabled),
    activeTimeBands,
    behaviorProfile: behaviorProfile as LeoSaveUserConfigPayload["behaviorProfile"],
    sessionBudget: Number(raw?.sessionBudget ?? 0),
    hardStopLoss: Number(raw?.hardStopLoss ?? 0),
    maxConcurrentTables: Number(raw?.maxConcurrentTables ?? 0),
    preferredTemplateIds: Array.isArray(raw?.preferredTemplateIds)
      ? raw.preferredTemplateIds.map(String)
      : [],
    randomTemplateIds: Array.isArray(raw?.randomTemplateIds)
      ? raw.randomTemplateIds.map(String)
      : [],
    appliedPresetName: (() => {
      const name = String(raw?.appliedPresetName ?? "").trim();
      return name ? name.slice(0, 80) : null;
    })(),
  };
}

export function parseLeoPresetName(body: unknown): string {
  const raw = body as Record<string, unknown>;
  const name = String(raw?.name ?? "").trim();
  if (!name) {
    throw new Error("preset name is required");
  }
  if (name.length > 80) {
    throw new Error("preset name too long");
  }
  return name;
}

function parseStakeCap(item: unknown): {
  stakeTier: LeoStakeTier;
  maxActivePlayers: number;
  shuffleEnabled: boolean;
} {
  const row = item as Record<string, unknown>;
  const stakeTier = String(row?.stakeTier ?? "");
  if (!isLeoStakeTier(stakeTier)) {
    throw new Error("invalid stake tier");
  }
  const maxActivePlayers = Math.floor(Number(row?.maxActivePlayers ?? 0));
  if (!Number.isInteger(maxActivePlayers) || maxActivePlayers < 0 || maxActivePlayers > 500) {
    throw new Error("maxActivePlayers must be 0..500");
  }
  return {
    stakeTier,
    maxActivePlayers,
    shuffleEnabled: Boolean(row?.shuffleEnabled),
  };
}

export function parseLeoBandCapsPayload(body: unknown): {
  bands: Array<{
    timeBand: LeoTimeBand;
    stakes: Array<{
      stakeTier: LeoStakeTier;
      maxActivePlayers: number;
      shuffleEnabled: boolean;
    }>;
  }>;
  maxLeoPlayersPerWaitingRoom: number;
  maxLeoCardsPerJoin: number;
} {
  const raw = body as Record<string, unknown>;
  const bands = Array.isArray(raw?.bands) ? raw.bands : [];
  if (bands.length === 0) {
    throw new Error("bands are required");
  }

  const maxLeoPlayersPerWaitingRoom = Math.floor(Number(raw?.maxLeoPlayersPerWaitingRoom ?? 3));
  if (
    !Number.isInteger(maxLeoPlayersPerWaitingRoom) ||
    maxLeoPlayersPerWaitingRoom < 0 ||
    maxLeoPlayersPerWaitingRoom > 50
  ) {
    throw new Error("maxLeoPlayersPerWaitingRoom must be 0..50");
  }

  const maxLeoCardsPerJoin = Math.floor(Number(raw?.maxLeoCardsPerJoin ?? 0));
  if (
    !Number.isInteger(maxLeoCardsPerJoin) ||
    maxLeoCardsPerJoin < 0 ||
    maxLeoCardsPerJoin > 99
  ) {
    throw new Error("maxLeoCardsPerJoin must be 0..99");
  }

  return {
    maxLeoPlayersPerWaitingRoom,
    maxLeoCardsPerJoin,
    bands: bands.map((item) => {
      const row = item as Record<string, unknown>;
      const timeBand = String(row?.timeBand ?? "") as LeoTimeBand;
      if (!LEO_TIME_BANDS.includes(timeBand)) {
        throw new Error("invalid time band");
      }

      const rawStakes = Array.isArray(row?.stakes) ? row.stakes : [];
      const parsed = rawStakes.map(parseStakeCap);
      const byTier = new Map(parsed.map((stake) => [stake.stakeTier, stake]));
      const stakes = LEO_STAKE_TIERS.map((stakeTier) => {
        const existing = byTier.get(stakeTier);
        if (!existing) {
          throw new Error("stakes must include light, medium, and heavy");
        }
        return existing;
      });

      return { timeBand, stakes };
    }),
  };
}
