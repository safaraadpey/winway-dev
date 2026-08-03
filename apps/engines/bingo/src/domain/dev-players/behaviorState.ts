import type {
  BehaviorMode,
  SchedulerBehaviorState,
  TemplateBehaviorState,
} from "./types.js";

export const BEHAVIOR_CYCLE_MIN_SECONDS = 50;
export const BEHAVIOR_CYCLE_MAX_SECONDS = 500;

export const EMPTY_SCHEDULER_BEHAVIOR_STATE: SchedulerBehaviorState = {
  cycleStartedAt: null,
  cycleEndsAt: null,
  templates: {},
};

const BEHAVIOR_MODES: BehaviorMode[] = [
  "idle",
  "fast_fill_burst",
  "natural_join_drip",
  "create_drip_light",
];

function isBehaviorMode(value: unknown): value is BehaviorMode {
  return typeof value === "string" && BEHAVIOR_MODES.includes(value as BehaviorMode);
}

function parseTemplateBehaviorState(raw: unknown): TemplateBehaviorState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (!isBehaviorMode(row.mode)) return null;

  const snapshotRaw = row.snapshot;
  let snapshot: TemplateBehaviorState["snapshot"];
  if (snapshotRaw && typeof snapshotRaw === "object" && !Array.isArray(snapshotRaw)) {
    const s = snapshotRaw as Record<string, unknown>;
    snapshot = {
      waitingRoomsCount: Number(s.waitingRoomsCount ?? 0),
      activeRoomsCount: Number(s.activeRoomsCount ?? 0),
      availableBotsCount: Number(s.availableBotsCount ?? 0),
      quickFillEnabled: Boolean(s.quickFillEnabled),
      maxActiveRooms:
        s.maxActiveRooms === null || s.maxActiveRooms === undefined
          ? null
          : Number(s.maxActiveRooms),
      maxPlayers: Number(s.maxPlayers ?? 0),
    };
  }

  return {
    mode: row.mode,
    remainingJoins:
      row.remainingJoins === null || row.remainingJoins === undefined
        ? undefined
        : Math.max(0, Math.floor(Number(row.remainingJoins))),
    burstStartedAt:
      typeof row.burstStartedAt === "string" ? row.burstStartedAt : undefined,
    burstEndsAt: typeof row.burstEndsAt === "string" ? row.burstEndsAt : undefined,
    nextJoinAt: typeof row.nextJoinAt === "string" ? row.nextJoinAt : undefined,
    burstRoomsTarget:
      row.burstRoomsTarget === null || row.burstRoomsTarget === undefined
        ? undefined
        : Math.max(0, Math.floor(Number(row.burstRoomsTarget))),
    burstJoinsTarget:
      row.burstJoinsTarget === null || row.burstJoinsTarget === undefined
        ? undefined
        : Math.max(0, Math.floor(Number(row.burstJoinsTarget))),
    burstJoinsScheduled:
      row.burstJoinsScheduled === null || row.burstJoinsScheduled === undefined
        ? undefined
        : Math.max(0, Math.floor(Number(row.burstJoinsScheduled))),
    burstJoinsSucceeded:
      row.burstJoinsSucceeded === null || row.burstJoinsSucceeded === undefined
        ? undefined
        : Math.max(0, Math.floor(Number(row.burstJoinsSucceeded))),
    burstJoinsFailed:
      row.burstJoinsFailed === null || row.burstJoinsFailed === undefined
        ? undefined
        : Math.max(0, Math.floor(Number(row.burstJoinsFailed))),
    snapshot,
  };
}

export function parseSchedulerBehaviorState(raw: unknown): SchedulerBehaviorState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_SCHEDULER_BEHAVIOR_STATE };
  }

  const row = raw as Record<string, unknown>;
  const templates: Record<string, TemplateBehaviorState> = {};

  if (row.templates && typeof row.templates === "object" && !Array.isArray(row.templates)) {
    for (const [templateId, value] of Object.entries(
      row.templates as Record<string, unknown>
    )) {
      const parsed = parseTemplateBehaviorState(value);
      if (parsed) templates[templateId] = parsed;
    }
  }

  return {
    cycleStartedAt:
      typeof row.cycleStartedAt === "string" ? row.cycleStartedAt : null,
    cycleEndsAt: typeof row.cycleEndsAt === "string" ? row.cycleEndsAt : null,
    templates,
  };
}

export function isBehaviorCycleExpired(
  state: SchedulerBehaviorState,
  now: Date
): boolean {
  if (!state.cycleEndsAt) return true;
  return now.getTime() >= new Date(state.cycleEndsAt).getTime();
}
