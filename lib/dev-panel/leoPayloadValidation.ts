import { LEO_BEHAVIOR_PROFILES, LEO_TIME_BANDS } from "@dingmoney/leo-behavior-core";
import type { LeoSaveUserConfigPayload, LeoTimeBand } from "@/src/types/leo";

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
  };
}

export function parseLeoPresetName(body: unknown): string {
  const raw = body as Record<string, unknown>;
  const name = String(raw?.name ?? "").trim();
  if (!name) {
    throw new Error("preset name is required");
  }
  return name;
}
