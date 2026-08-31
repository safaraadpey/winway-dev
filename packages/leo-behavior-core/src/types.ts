export const LEO_TIME_BANDS = [
  "midnight",
  "dawn",
  "morning",
  "noon",
  "afternoon",
  "evening",
] as const;

export type LeoTimeBand = (typeof LEO_TIME_BANDS)[number];

export const LEO_BEHAVIOR_PROFILES = [
  "methodical",
  "emotional",
  "hot_hand",
  "distracted",
  "cautious",
] as const;

export type LeoBehaviorProfile = (typeof LEO_BEHAVIOR_PROFILES)[number];

export type LeoTablePoolSource = "preferred" | "random";

export type LeoTimelineEventType =
  | "enter"
  | "session_start"
  | "round_join"
  | "break"
  | "exit"
  | "skip";

export type LeoUserBehaviorConfig = {
  behaviorProfile: LeoBehaviorProfile;
  sessionBudget: number;
  hardStopLoss: number;
  /** 0 = use all templates in the active pool as concurrent cap */
  maxConcurrentTables: number;
  preferredTemplateIds: string[];
  randomTemplateIds: string[];
};

export type LeoSessionRuntimeState = {
  sessionSpend: number;
  sessionPnl: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  roundsPlayed: number;
  fatigue: number;
  inTilt: boolean;
  inHotStreak: boolean;
};

export type LeoTimelineEvent = {
  sequence: number;
  eventType: LeoTimelineEventType;
  scheduledAt: Date;
  sessionIndex: number;
  tablePoolSource?: LeoTablePoolSource;
  templateId?: string;
  cardCount?: number;
  roundDelaySeconds?: number;
  concurrentJoinIndex?: number;
  concurrentJoinTotal?: number;
  label?: string;
};

export type GenerateWindowTimelineInput = {
  windowDate: string;
  timeBand: LeoTimeBand;
  config: LeoUserBehaviorConfig;
  timezone?: string;
  random?: () => number;
};

export type GenerateWindowTimelineResult = {
  events: LeoTimelineEvent[];
  windowStart: Date;
  windowEnd: Date;
};

export type AdjustRoundParamsInput = {
  profile: LeoBehaviorProfile;
  runtime: LeoSessionRuntimeState;
  baseCardCount: number;
  baseRoundDelaySeconds: number;
  random?: () => number;
};

export type AdjustRoundParamsResult = {
  cardCount: number;
  roundDelaySeconds: number;
  skipRound: boolean;
  earlyExit: boolean;
  rageQuit: boolean;
};

export type EnforceHardLimitsInput = {
  sessionBudget: number;
  hardStopLoss: number;
  runtime: LeoSessionRuntimeState;
  proposedSpend: number;
};

export type EnforceHardLimitsResult = {
  allowed: boolean;
  forceExit: boolean;
  reason: "ok" | "budget_exhausted" | "stop_loss_hit";
};

export function createEmptySessionRuntime(): LeoSessionRuntimeState {
  return {
    sessionSpend: 0,
    sessionPnl: 0,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    roundsPlayed: 0,
    fatigue: 0,
    inTilt: false,
    inHotStreak: false,
  };
}
