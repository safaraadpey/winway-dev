import type {
  BehaviorMode,
  RoomTemplateSnapshot,
  TemplateBehaviorSnapshot,
  TemplateBehaviorState,
  TemplateLimitSnapshot,
  TemplateRuntimeSnapshot,
} from "./types.js";

export interface ModeSelectionInput {
  snapshot: TemplateRuntimeSnapshot;
  limit: TemplateLimitSnapshot;
  template: RoomTemplateSnapshot;
  availableBotsCount: number;
}

/**
 * Select behavior mode at cycle start.
 * Fast fill requires max_players; otherwise falls back to create_drip_light.
 */
export function selectBehaviorMode(input: ModeSelectionInput): BehaviorMode {
  const { snapshot, limit, template, availableBotsCount } = input;
  const maxActive = limit.maxActiveRooms;

  if (maxActive !== null && snapshot.activeRoomsCount >= maxActive) {
    return "idle";
  }

  if (snapshot.waitingRoomsCount > 0) {
    return "natural_join_drip";
  }

  if (limit.quickFillEnabled) {
    if (template.maxPlayers === null || template.maxPlayers <= 0) {
      return "create_drip_light";
    }
    if (availableBotsCount <= 0) {
      return "idle";
    }
    return "fast_fill_burst";
  }

  return "create_drip_light";
}

export function buildTemplateSnapshot(
  runtime: TemplateRuntimeSnapshot,
  limit: TemplateLimitSnapshot,
  template: RoomTemplateSnapshot,
  availableBotsCount: number
): TemplateBehaviorSnapshot {
  return {
    waitingRoomsCount: runtime.waitingRoomsCount,
    activeRoomsCount: runtime.activeRoomsCount,
    availableBotsCount,
    quickFillEnabled: limit.quickFillEnabled,
    maxActiveRooms: limit.maxActiveRooms,
    maxPlayers: template.maxPlayers ?? 0,
  };
}

export function createIdleTemplateState(
  snapshot: TemplateBehaviorSnapshot
): TemplateBehaviorState {
  return { mode: "idle", snapshot };
}
