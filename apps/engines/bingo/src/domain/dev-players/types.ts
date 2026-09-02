export interface PlayWindow {
  start: string;
  end: string;
}

export type BehaviorMode =
  | "idle"
  | "fast_fill_burst"
  | "natural_join_drip"
  | "create_drip_light";

export interface TemplateBehaviorSnapshot {
  waitingRoomsCount: number;
  activeRoomsCount: number;
  availableBotsCount: number;
  quickFillEnabled: boolean;
  maxActiveRooms: number | null;
  maxPlayers: number;
}

export interface TemplateBehaviorState {
  mode: BehaviorMode;
  /** fast_fill_burst only */
  remainingJoins?: number;
  burstStartedAt?: string;
  burstEndsAt?: string;
  /** Observability — fast_fill_burst only */
  burstRoomsTarget?: number;
  burstJoinsTarget?: number;
  burstJoinsScheduled?: number;
  burstJoinsSucceeded?: number;
  burstJoinsFailed?: number;
  /** drip modes only */
  nextJoinAt?: string;
  snapshot?: TemplateBehaviorSnapshot;
}

export interface SchedulerBehaviorState {
  cycleStartedAt: string | null;
  cycleEndsAt: string | null;
  templates: Record<string, TemplateBehaviorState>;
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
  behaviorState: SchedulerBehaviorState;
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

export interface DevPlayerProfileSnapshot {
  playWindows: PlayWindow[];
  allowedPrices: number[];
}

export interface DevPlayerConfigSnapshot {
  userId: string;
  profiles: DevPlayerProfileSnapshot[];
}

export interface TemplateLimitSnapshot {
  templateId: string;
  minActiveRooms: number | null;
  maxActiveRooms: number | null;
  joinIntervalSeconds: number;
  maxJoinsPerTick: number;
  minNormalPlayersPerRoom: number | null;
  maxDevPlayersPerRoom: number | null;
  quickFillEnabled: boolean;
}

export interface RoomTemplateSnapshot {
  id: string;
  name: string;
  price: number;
  vip: boolean;
  roomType: string;
  status: string;
  maxCardsPerPlayer: number;
  maxPlayers: number | null;
}

export interface TemplateJoinSettingsSnapshot {
  joinDelayMaxSeconds: number;
  maxDevPlayersPerRoom: number | null;
}

export interface TemplateRuntimeSnapshot {
  templateId: string;
  waitingRoomsCount: number;
  activeRoomsCount: number;
  joinTargetDevPlayers: number;
  joinTargetNormalPlayers: number;
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

export interface BuildScheduleBatchOptions {
  maxInsertsPerTick: number;
}

export interface BuildScheduleBatchResult {
  created: number;
  skipped: {
    systemOff: number;
    outsidePresetWindow: number;
    outsidePlayerWindow: number;
    wallet: number;
    priceRange: number;
    templateFiltered: number;
    duplicatePending: number;
    noEligiblePlayer: number;
    noDistinctBot: number;
    dripNotDue: number;
    templateJoinPending: number;
    devPlayerCapReached: number;
    insertBudgetExhausted: number;
    cycleIdle: number;
  };
  behavior?: {
    cycleEndsAt: string | null;
    burstStats?: Record<
      string,
      {
        burstRoomsTarget: number;
        burstJoinsTarget: number;
        burstJoinsScheduled: number;
        burstJoinsSucceeded: number;
        burstJoinsFailed: number;
        remainingJoins: number;
      }
    >;
  };
}

export interface ProcessScheduleBatchResult {
  processed: number;
  failed: number;
  requeued: number;
}

export interface ScheduleOutcomeCounts {
  succeeded: number;
  failed: number;
}
