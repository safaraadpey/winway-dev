export interface PlayWindow {
  start: string;
  end: string;
}

export interface DevPlayerSettingsSnapshot {
  systemEnabled: boolean;
  schedulerEnabled: boolean;
  schedulerTickIntervalSeconds: number;
  processorTickIntervalSeconds: number;
  schedulerPauseAfterSeconds: number | null;
  schedulerPauseDurationSeconds: number | null;
  timezone: string;
  activeJoinPresetId: string | null;
}

export interface DevPlayerSettingsWithRuntime {
  settings: DevPlayerSettingsSnapshot;
  runtime: {
    cyclePhase: "work" | "pause";
    cyclePhaseEndsAt: string | null;
    nextJoinAtByTemplate: Record<string, string>;
    joinsInWorkCycleByTemplate: Record<string, number>;
  };
}

export interface DevPlayerJoinPresetSnapshot {
  id: string;
  name: string;
  playWindows: PlayWindow[];
  templateRoomLimitEnabledIds: string[];
  minWalletBalance: number;
  excludeVip: boolean;
  excludeTournament: boolean;
  autoApproveSchedules: boolean;
}

export interface DevPlayerConfigSnapshot {
  userId: string;
  playWindows: PlayWindow[];
  minRoomPrice: number | null;
  maxRoomPrice: number | null;
  maxTicketCount: number;
}

export interface TemplateLimitSnapshot {
  templateId: string;
  minActiveRooms: number | null;
  maxActiveRooms: number | null;
  joinIntervalSeconds: number;
  maxJoinsPerTick: number;
  minNormalPlayersPerRoom: number | null;
  maxDevPlayersPerRoom: number | null;
}

export interface RoomTemplateSnapshot {
  id: string;
  name: string;
  price: number;
  vip: boolean;
  roomType: string;
  status: string;
  maxCardsPerPlayer: number;
}

export interface ScheduleInsertRow {
  userId: string;
  roomTemplateId: string;
  ticketCount: number;
  scheduledAt: string;
  status: "draft" | "approved";
  createdBy: string;
}

export interface DevRoomScheduleJob {
  id: string;
  user_id: string;
  room_template_id: string;
  ticket_count: number;
}

export interface BuildScheduleBatchResult {
  created: number;
  skipped: {
    systemOff: number;
    schedulerPause: number;
    outsidePresetWindow: number;
    outsidePlayerWindow: number;
    wallet: number;
    priceRange: number;
    templateFiltered: number;
    roomLimit: number;
    joinInterval: number;
    maxPerTick: number;
    roomDevPlayerLimit: number;
    normalPlayerRequirement: number;
    duplicatePending: number;
    noEligiblePlayer: number;
    noEligibleTemplate: number;
  };
}

export interface ProcessScheduleBatchResult {
  processed: number;
  failed: number;
  requeued: number;
}
