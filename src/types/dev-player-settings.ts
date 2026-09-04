import type { DevPlayWindow } from "./dev-players";

export type { DevPlayWindow };

export type TemplateSelectionMode =
  | "any_in_price_range"
  | "cheapest"
  | "random"
  | "whitelist";

export const DEFAULT_SCHEDULER_TICK_INTERVAL_SECONDS = 60;
export const DEFAULT_PROCESSOR_TICK_INTERVAL_SECONDS = 60;
export const MIN_SCHEDULER_TICK_INTERVAL_SECONDS = 5;
export const MAX_SCHEDULER_TICK_INTERVAL_SECONDS = 3600;
export const MIN_PROCESSOR_TICK_INTERVAL_SECONDS = MIN_SCHEDULER_TICK_INTERVAL_SECONDS;
export const MAX_PROCESSOR_TICK_INTERVAL_SECONDS = MAX_SCHEDULER_TICK_INTERVAL_SECONDS;
export const MIN_SCHEDULER_PAUSE_SECONDS = 5;
export const MAX_SCHEDULER_PAUSE_SECONDS = 86400;

export interface DevPlayerSettings {
  systemEnabled: boolean;
  schedulerEnabled: boolean;
  schedulerTickIntervalSeconds: number;
  processorTickIntervalSeconds: number;
  schedulerPauseAfterSeconds: number | null;
  schedulerPauseDurationSeconds: number | null;
  timezone: string;
  activeJoinPresetId: string | null;
  updatedAt: string | null;
}

export interface DevPlayerJoinPreset {
  id: string;
  name: string;
  playWindows: DevPlayWindow[];
  templateRoomLimitEnabledIds: string[];
  minWalletBalance: number;
  excludeVip: boolean;
  excludeTournament: boolean;
  autoApproveSchedules: boolean;
  templateLimits: DevPlayerJoinPresetTemplateLimit[];
  updatedAt: string | null;
}

export const DEFAULT_JOIN_PRESET_PLAY_WINDOWS: DevPlayWindow[] = [
  { start: "10:00", end: "22:00" },
];

export interface DevPlayerJoinPresetTemplateLimit {
  templateId: string;
  minActiveRooms: number | null;
  maxActiveRooms: number | null;
  joinIntervalSeconds: number | null;
  maxJoinsPerTick: number | null;
  minNormalPlayersPerRoom: number | null;
  maxDevPlayersPerRoom: number | null;
  quickFillEnabled: boolean;
}

export interface DevPlayerSettingsResult {
  settings: DevPlayerSettings;
  activePlayers: DevPlayerActiveRow[];
  activePlayerCount: number;
  runtimeStats: DevPlayerRuntimeStats;
  templates: DevPlayerTemplateOption[];
  joinPresets: DevPlayerJoinPreset[];
}

/** @deprecated Active players are managed via profiles. Kept for API compatibility. */
export interface DevPlayerActiveRow {
  userId: string;
  username: string;
  nickname: string | null;
  displayName: string;
  playWindows: DevPlayWindow[];
  minRoomPrice: number | null;
  maxRoomPrice: number | null;
  maxTicketCount: number;
  updatedAt: string | null;
}

export interface TemplateRhythmWindow {
  start: string;
  end: string;
  joinDelayMaxSeconds: number;
  /** Null = unlimited Dev Players in the join-target waiting room. */
  maxDevPlayersPerRoom: number | null;
}

export interface DevPlayerTemplateOption {
  id: string;
  name: string;
  price: number;
  currency: string;
  status: string;
  roomType: string;
  vip: boolean;
  minActiveRooms: number | null;
  maxActiveRooms: number | null;
  joinIntervalSeconds: number | null;
  maxJoinsPerTick: number | null;
  joinDelayMaxSeconds: number;
  /** Null = unlimited Dev Players in the join-target waiting room. */
  maxDevPlayersPerRoom: number | null;
  /** Time-of-day overrides; first matching [start, end) in scheduler timezone wins. */
  rhythmWindows: TemplateRhythmWindow[];
}

export const DEFAULT_TEMPLATE_JOIN_INTERVAL_SECONDS = 300;
export const MIN_TEMPLATE_JOIN_INTERVAL_SECONDS = 5;
export const MAX_TEMPLATE_JOIN_INTERVAL_SECONDS = 7200;
export const DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS = 20;
export const MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS = 0;
export const MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS = 7200;

export const TEMPLATE_JOIN_DELAY_PRESETS = [
  { seconds: 20, label: "شلوغ" },
  { seconds: 50, label: "پرتردد" },
  { seconds: 100, label: "متوسط" },
  { seconds: 200, label: "کم‌تردد" },
  { seconds: 300, label: "خلوت" },
  { seconds: 400, label: "خیلی خلوت" },
] as const;

export type TemplateJoinDelayPresetSeconds =
  (typeof TEMPLATE_JOIN_DELAY_PRESETS)[number]["seconds"];

export function isTemplateJoinDelayPreset(seconds: number): boolean {
  return TEMPLATE_JOIN_DELAY_PRESETS.some((preset) => preset.seconds === seconds);
}

export function formatJoinDelayPresetLabel(seconds: number, label: string): string {
  return `${label} · ${seconds}`;
}
export const MIN_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM = 0;
export const MAX_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM = 99;
/** Max dev-player joins per template during each scheduler work phase (before pause). */
export const DEFAULT_TEMPLATE_MAX_JOINS_PER_TICK = 10;

export interface DevPlayerTemplateRoomLimitPayload {
  template_id: string;
  min_active_rooms: number | null;
  max_active_rooms: number | null;
  join_interval_seconds: number;
  max_joins_per_tick: number;
  min_normal_players_per_room: number | null;
  max_dev_players_per_room: number | null;
  quick_fill_enabled: boolean;
}

export interface DevPlayerRuntimeStats {
  activeRoomsCount: number;
  busyDevPlayersCount: number;
  busyNormalPlayersCount: number;
  idleDevPlayersCount: number;
  pendingSchedulesCount: number;
  schedulerPhase: "work" | "pause" | null;
  updatedAt: string;
}

export const DEFAULT_DEV_PLAYER_RUNTIME_STATS: DevPlayerRuntimeStats = {
  activeRoomsCount: 0,
  busyDevPlayersCount: 0,
  busyNormalPlayersCount: 0,
  idleDevPlayersCount: 0,
  pendingSchedulesCount: 0,
  schedulerPhase: null,
  updatedAt: new Date(0).toISOString(),
};


export const TEMPLATE_SELECTION_LABELS: Record<TemplateSelectionMode, string> = {
  any_in_price_range: "هر میز در بازه قیمت",
  cheapest: "ارزان‌ترین میز",
  random: "انتخاب تصادفی",
  whitelist: "فقط لیست سفید",
};

export const DEFAULT_DEV_PLAYER_SETTINGS: DevPlayerSettings = {
  systemEnabled: false,
  schedulerEnabled: false,
  schedulerTickIntervalSeconds: DEFAULT_SCHEDULER_TICK_INTERVAL_SECONDS,
  processorTickIntervalSeconds: DEFAULT_PROCESSOR_TICK_INTERVAL_SECONDS,
  schedulerPauseAfterSeconds: null,
  schedulerPauseDurationSeconds: null,
  timezone: "Asia/Tehran",
  activeJoinPresetId: null,
  updatedAt: null,
};
