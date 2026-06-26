import { randomIntInclusive } from "./random.js";
import type {
  RoomTemplateSnapshot,
  TemplateBehaviorState,
  TemplateLimitSnapshot,
  TemplateRuntimeSnapshot,
} from "./types.js";
import { buildTemplateSnapshot } from "./behaviorModes.js";

export const FAST_FILL_MIN_ROOMS = 3;
export const FAST_FILL_MAX_ROOMS = 5;

export function computeBurstRoomTarget(
  limit: TemplateLimitSnapshot,
  activeRoomsCount: number
): number {
  const desired = randomIntInclusive(FAST_FILL_MIN_ROOMS, FAST_FILL_MAX_ROOMS);
  if (limit.maxActiveRooms === null) return desired;
  const remainingCapacity = Math.max(0, limit.maxActiveRooms - activeRoomsCount);
  return Math.min(desired, remainingCapacity);
}

export function initFastFillBurstState(args: {
  template: RoomTemplateSnapshot;
  limit: TemplateLimitSnapshot;
  runtime: TemplateRuntimeSnapshot;
  availableBotsCount: number;
  cycleStartedAt: string;
}): TemplateBehaviorState {
  const { template, limit, runtime, availableBotsCount, cycleStartedAt } = args;
  const maxPlayers = template.maxPlayers!;
  const burstRoomsTarget = computeBurstRoomTarget(limit, runtime.activeRoomsCount);
  const burstJoinsTarget = burstRoomsTarget * maxPlayers;
  const remainingJoins = Math.min(burstJoinsTarget, availableBotsCount);

  return {
    mode: "fast_fill_burst",
    remainingJoins,
    burstStartedAt: cycleStartedAt,
    burstRoomsTarget,
    burstJoinsTarget,
    burstJoinsScheduled: 0,
    burstJoinsSucceeded: 0,
    burstJoinsFailed: 0,
    snapshot: buildTemplateSnapshot(runtime, limit, template, availableBotsCount),
  };
}

export function decrementFastFillAfterEmit(
  state: TemplateBehaviorState,
  emitted: number
): void {
  if (emitted <= 0) return;
  state.burstJoinsScheduled = (state.burstJoinsScheduled ?? 0) + emitted;
  if (state.remainingJoins !== undefined) {
    state.remainingJoins = Math.max(0, state.remainingJoins - emitted);
  }
}

export function applyBurstOutcomeCounts(
  state: TemplateBehaviorState,
  counts: { succeeded: number; failed: number }
): void {
  state.burstJoinsSucceeded = counts.succeeded;
  state.burstJoinsFailed = counts.failed;
}
