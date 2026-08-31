import type { LeoBehaviorProfile, LeoTablePoolSource } from "./types";

/** Numeric ranges and behavioral knobs — single source of truth for balance tuning. */
export type LeoProfilePreset = {
  sessionDurationMinutes: { min: number; max: number };
  sessionCount: { min: number; max: number };
  breakDurationMinutes: { min: number; max: number };
  roundDelaySeconds: { min: number; max: number };
  baseCardCount: { min: number; max: number };
  skipProbability: { base: number; max: number; fatigueMultiplier: number };
  /** Per-session chance to pick preferred pool vs random pool (not fallback). */
  preferredPoolWeight: number;
  /** How many tables to join concurrently in one round burst (capped by pool + maxConcurrentTables). */
  concurrentTablesPerRound: { min: number; max: number };
  /** Seconds between staggered joins within the same round burst. */
  staggerJoinSeconds: { min: number; max: number };
  lossStreak: {
    cardBonusMax: number;
    delayReductionMaxSeconds: number;
    rageQuitAfter: number | null;
    riskIncreaseFactor: number;
  };
  winStreak: {
    cardBonusMax: number;
    delayReductionMaxSeconds: number;
    sessionExtensionMinutes: number;
    riskIncreaseFactor: number;
  };
  bigWin: {
    cardReduction: number;
    skipBoost: number;
    earlyExitProbability: number;
  };
  fatiguePerRound: number;
};

export const LEO_PROFILE_PRESETS: Record<LeoBehaviorProfile, LeoProfilePreset> = {
  methodical: {
    sessionDurationMinutes: { min: 45, max: 60 },
    sessionCount: { min: 1, max: 2 },
    breakDurationMinutes: { min: 30, max: 50 },
    roundDelaySeconds: { min: 10, max: 15 },
    baseCardCount: { min: 2, max: 3 },
    skipProbability: { base: 0.01, max: 0.02, fatigueMultiplier: 0.5 },
    preferredPoolWeight: 0.85,
    concurrentTablesPerRound: { min: 2, max: 4 },
    staggerJoinSeconds: { min: 8, max: 25 },
    lossStreak: {
      cardBonusMax: 0,
      delayReductionMaxSeconds: 0,
      rageQuitAfter: null,
      riskIncreaseFactor: 1,
    },
    winStreak: {
      cardBonusMax: 0,
      delayReductionMaxSeconds: 0,
      sessionExtensionMinutes: 0,
      riskIncreaseFactor: 1,
    },
    bigWin: { cardReduction: 0, skipBoost: 0, earlyExitProbability: 0 },
    fatiguePerRound: 0.005,
  },
  emotional: {
    sessionDurationMinutes: { min: 20, max: 40 },
    sessionCount: { min: 1, max: 3 },
    breakDurationMinutes: { min: 10, max: 25 },
    roundDelaySeconds: { min: 0, max: 15 },
    baseCardCount: { min: 1, max: 3 },
    skipProbability: { base: 0, max: 0.02, fatigueMultiplier: 1 },
    preferredPoolWeight: 0.55,
    concurrentTablesPerRound: { min: 1, max: 3 },
    staggerJoinSeconds: { min: 4, max: 15 },
    lossStreak: {
      cardBonusMax: 3,
      delayReductionMaxSeconds: 12,
      rageQuitAfter: 4,
      riskIncreaseFactor: 1.4,
    },
    winStreak: {
      cardBonusMax: 1,
      delayReductionMaxSeconds: 3,
      sessionExtensionMinutes: 5,
      riskIncreaseFactor: 1.1,
    },
    bigWin: { cardReduction: 0, skipBoost: 0, earlyExitProbability: 0.05 },
    fatiguePerRound: 0.02,
  },
  hot_hand: {
    sessionDurationMinutes: { min: 30, max: 60 },
    sessionCount: { min: 1, max: 2 },
    breakDurationMinutes: { min: 15, max: 35 },
    roundDelaySeconds: { min: 3, max: 15 },
    baseCardCount: { min: 1, max: 3 },
    skipProbability: { base: 0, max: 0.01, fatigueMultiplier: 0.5 },
    preferredPoolWeight: 0.7,
    concurrentTablesPerRound: { min: 2, max: 5 },
    staggerJoinSeconds: { min: 5, max: 20 },
    lossStreak: {
      cardBonusMax: 0,
      delayReductionMaxSeconds: 0,
      rageQuitAfter: null,
      riskIncreaseFactor: 0.7,
    },
    winStreak: {
      cardBonusMax: 2,
      delayReductionMaxSeconds: 8,
      sessionExtensionMinutes: 15,
      riskIncreaseFactor: 1.5,
    },
    bigWin: {
      cardReduction: 0,
      skipBoost: 0,
      earlyExitProbability: 0,
    },
    fatiguePerRound: 0.01,
  },
  distracted: {
    sessionDurationMinutes: { min: 15, max: 30 },
    sessionCount: { min: 2, max: 4 },
    breakDurationMinutes: { min: 20, max: 60 },
    roundDelaySeconds: { min: 20, max: 90 },
    baseCardCount: { min: 1, max: 4 },
    skipProbability: { base: 0.15, max: 0.3, fatigueMultiplier: 2 },
    preferredPoolWeight: 0.35,
    concurrentTablesPerRound: { min: 1, max: 2 },
    staggerJoinSeconds: { min: 20, max: 60 },
    lossStreak: {
      cardBonusMax: 0,
      delayReductionMaxSeconds: 0,
      rageQuitAfter: null,
      riskIncreaseFactor: 1,
    },
    winStreak: {
      cardBonusMax: 0,
      delayReductionMaxSeconds: 0,
      sessionExtensionMinutes: 0,
      riskIncreaseFactor: 1,
    },
    bigWin: { cardReduction: 0, skipBoost: 0.1, earlyExitProbability: 0.15 },
    fatiguePerRound: 0.08,
  },
  cautious: {
    sessionDurationMinutes: { min: 20, max: 35 },
    sessionCount: { min: 1, max: 2 },
    breakDurationMinutes: { min: 25, max: 45 },
    roundDelaySeconds: { min: 20, max: 40 },
    baseCardCount: { min: 1, max: 2 },
    skipProbability: { base: 0.1, max: 0.2, fatigueMultiplier: 1.2 },
    preferredPoolWeight: 0.9,
    concurrentTablesPerRound: { min: 1, max: 2 },
    staggerJoinSeconds: { min: 15, max: 40 },
    lossStreak: {
      cardBonusMax: 0,
      delayReductionMaxSeconds: 0,
      rageQuitAfter: 2,
      riskIncreaseFactor: 0.5,
    },
    winStreak: {
      cardBonusMax: 0,
      delayReductionMaxSeconds: 0,
      sessionExtensionMinutes: 0,
      riskIncreaseFactor: 0.6,
    },
    bigWin: {
      cardReduction: 1,
      skipBoost: 0.15,
      earlyExitProbability: 0.45,
    },
    fatiguePerRound: 0.03,
  },
};

export function getProfilePreset(profile: LeoBehaviorProfile): LeoProfilePreset {
  return LEO_PROFILE_PRESETS[profile];
}

export function pickSessionTablePoolSource(
  profile: LeoBehaviorProfile,
  random: () => number
): LeoTablePoolSource {
  const preset = getProfilePreset(profile);
  return random() < preset.preferredPoolWeight ? "preferred" : "random";
}
