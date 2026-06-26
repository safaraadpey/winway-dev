import { randomIntInclusive } from "./random.js";
import {
  BEHAVIOR_CYCLE_MAX_SECONDS,
  BEHAVIOR_CYCLE_MIN_SECONDS,
} from "./behaviorState.js";
import {
  createIdleTemplateState,
  selectBehaviorMode,
  buildTemplateSnapshot,
} from "./behaviorModes.js";
import {
  buildModeSelectionInput,
  initCreateDripLightState,
  initNaturalJoinDripState,
} from "./dripModes.js";
import { initFastFillBurstState } from "./fastFillBurst.js";
import type {
  DevPlayerConfigSnapshot,
  DevPlayerJoinPresetSnapshot,
  RoomTemplateSnapshot,
  SchedulerBehaviorState,
  TemplateBehaviorState,
  TemplateLimitSnapshot,
  TemplateRuntimeSnapshot,
} from "./types.js";

export function rollBehaviorCycleDurationSeconds(): number {
  return randomIntInclusive(BEHAVIOR_CYCLE_MIN_SECONDS, BEHAVIOR_CYCLE_MAX_SECONDS);
}

export function startNewBehaviorCycle(args: {
  now: Date;
  preset: DevPlayerJoinPresetSnapshot;
  templatesById: Map<string, RoomTemplateSnapshot>;
  limitsByTemplate: Map<string, TemplateLimitSnapshot>;
  runtimeByTemplate: Map<string, TemplateRuntimeSnapshot>;
  enabledPlayers: DevPlayerConfigSnapshot[];
  occupiedDevPlayerIds: Set<string>;
}): SchedulerBehaviorState {
  const cycleStartedAt = args.now.toISOString();
  const cycleEndsAt = new Date(
    args.now.getTime() + rollBehaviorCycleDurationSeconds() * 1000
  ).toISOString();

  const templates: Record<string, TemplateBehaviorState> = {};
  const availableBotsCount = Math.max(
    0,
    args.enabledPlayers.length - args.occupiedDevPlayerIds.size
  );

  for (const templateId of args.preset.templateRoomLimitEnabledIds) {
    const template = args.templatesById.get(templateId);
    const limit = args.limitsByTemplate.get(templateId);
    const runtime = args.runtimeByTemplate.get(templateId);

    if (!template || !limit || !runtime) continue;

    const modeInput = buildModeSelectionInput({
      runtime,
      limit,
      template,
      availableBotsCount,
    });

    const mode = selectBehaviorMode(modeInput);
    const snapshot = buildTemplateSnapshot(
      runtime,
      limit,
      template,
      availableBotsCount
    );

    switch (mode) {
      case "idle":
        templates[templateId] = createIdleTemplateState(snapshot);
        break;
      case "fast_fill_burst":
        templates[templateId] = initFastFillBurstState({
          template,
          limit,
          runtime,
          availableBotsCount,
          cycleStartedAt,
        });
        break;
      case "natural_join_drip":
        templates[templateId] = initNaturalJoinDripState(modeInput, args.now);
        break;
      case "create_drip_light":
        templates[templateId] = initCreateDripLightState(modeInput, args.now);
        break;
    }
  }

  return { cycleStartedAt, cycleEndsAt, templates };
}
