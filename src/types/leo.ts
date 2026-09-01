import type {
  LeoBehaviorProfile,
  LeoStakeTier,
  LeoTimeBand,
  LeoTimelineEvent,
} from "@dingmoney/leo-behavior-core";

export type { LeoBehaviorProfile, LeoStakeTier, LeoTimeBand, LeoTimelineEvent };

export const LEO_STAKE_LABELS: Record<LeoStakeTier, string> = {
  light: "سبک",
  medium: "متوسط",
  heavy: "سنگین",
};

export const LEO_PROFILE_LABELS: Record<
  LeoBehaviorProfile,
  { title: string; description: string }
> = {
  methodical: {
    title: "صبور و منطقی",
    description: "رفتار منظم و باثبات؛ سشن‌های طولانی‌تر",
  },
  emotional: {
    title: "هیجانی",
    description: "واکنش به باخت و برد؛ ریسک متغیر",
  },
  hot_hand: {
    title: "برنده و ریسک‌پذیر",
    description: "فعال‌تر بعد از برد؛ کاهش ریسک بعد از باخت",
  },
  distracted: {
    title: "خسته و حواس‌پرت",
    description: "سشن کوتاه؛ skip و مکث بیشتر",
  },
  cautious: {
    title: "محتاط",
    description: "محافظه‌کار؛ خروج زودتر پس از سود",
  },
};

export const LEO_TIME_BAND_LABELS: Record<LeoTimeBand, string> = {
  midnight: "نیمه‌شب (۰۰–۰۵)",
  dawn: "سحر (۰۵–۰۸)",
  morning: "صبح (۰۸–۱۱)",
  noon: "ظهر (۱۱–۱۶)",
  afternoon: "عصر (۱۶–۱۹)",
  evening: "شب (۱۹–۲۴)",
};

export type LeoSettings = {
  systemEnabled: boolean;
  schedulerEnabled: boolean;
  schedulerTickSeconds: number;
  processorTickSeconds: number;
  timezone: string;
  /** Max Leo players per waiting room; 0 = unlimited */
  maxLeoPlayersPerWaitingRoom: number;
  /** Max cards per round_join; 0 = unlimited */
  maxLeoCardsPerJoin: number;
  updatedAt: string | null;
};

export type LeoBandCapsSaveResult = {
  bandCaps: LeoBandCap[];
  maxLeoPlayersPerWaitingRoom: number;
  maxLeoCardsPerJoin: number;
};

export type LeoBandStakeCap = {
  stakeTier: LeoStakeTier;
  maxActivePlayers: number;
  shuffleEnabled: boolean;
  readyCount: number;
  busyCount: number;
};

export type LeoBandStakeCapInput = Pick<
  LeoBandStakeCap,
  "stakeTier" | "maxActivePlayers" | "shuffleEnabled"
>;

export type LeoBandCap = {
  timeBand: LeoTimeBand;
  stakes: LeoBandStakeCap[];
  readyCount: number;
  busyCount: number;
};

export type LeoUserConfig = {
  userId: string;
  isEnabled: boolean;
  activeTimeBands: LeoTimeBand[];
  behaviorProfile: LeoBehaviorProfile;
  sessionBudget: number;
  hardStopLoss: number;
  maxConcurrentTables: number;
    preferredTemplateIds: string[];
    randomTemplateIds: string[];
    appliedPresetName: string | null;
    updatedAt: string | null;
};

export type LeoUserListRow = {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  leoEnabled: boolean;
  behaviorProfile: LeoBehaviorProfile | null;
  appliedPresetName: string | null;
  devPlayerActive: boolean;
};

export type LeoTemplateOption = {
  id: string;
  name: string;
  price: number;
  status: string;
  roomType: string;
};

export type LeoLiveStats = {
  /** Leo-enabled users currently seated in active rooms */
  activeLeoPlayers: number;
  /** Active rooms with at least one Leo player */
  leoRoomCount: number;
  /** Non-Leo players seated in Leo rooms */
  nonLeoPlayersInLeoRooms: number;
};

export type LeoOverview = {
  settings: LeoSettings;
  enabledUserCount: number;
  pendingEventCount: number;
  bandCaps: LeoBandCap[];
  liveStats: LeoLiveStats;
};

export type LeoUserDetail = LeoUserConfig & {
  username: string;
  displayName: string;
  devPlayerActive: boolean;
  canEnableLeo: boolean;
  conflictMessage: string | null;
};

export type LeoPreviewPayload = {
  userId?: string;
  behaviorProfile: LeoBehaviorProfile;
  sessionBudget: number;
  hardStopLoss: number;
  maxConcurrentTables: number;
  preferredTemplateIds: string[];
  randomTemplateIds: string[];
  timeBand: LeoTimeBand;
  windowDate?: string;
};

export type LeoPreviewResult = {
  windowDate: string;
  timeBand: LeoTimeBand;
  timeBandLabel: string;
  events: Array<{
    sequence: number;
    eventType: string;
    scheduledAt: string;
    sessionIndex: number;
    tablePoolSource?: string;
    templateId?: string;
    templateName?: string;
    cardCount?: number;
    concurrentJoinIndex?: number;
    concurrentJoinTotal?: number;
    label?: string;
  }>;
};

export type LeoSaveUserConfigPayload = {
  isEnabled: boolean;
  activeTimeBands: LeoTimeBand[];
  behaviorProfile: LeoBehaviorProfile;
  sessionBudget: number;
  hardStopLoss: number;
  maxConcurrentTables: number;
  preferredTemplateIds: string[];
  randomTemplateIds: string[];
  appliedPresetName?: string | null;
};

export type LeoConfigPreset = LeoSaveUserConfigPayload & {
  id: string;
  name: string;
  sourceUserId: string | null;
  sourceDisplayName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type LeoSavePresetPayload = LeoSaveUserConfigPayload & {
  name: string;
  sourceUserId?: string;
};

export type LeoConflictError = {
  error: "conflict_dev_player_active";
  message: string;
};
