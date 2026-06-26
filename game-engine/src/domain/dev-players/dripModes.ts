import { randomIntInclusive } from "./random.js";
import type { TemplateBehaviorState, TemplateRuntimeSnapshot } from "./types.js";
import {
  buildTemplateSnapshot,
  type ModeSelectionInput,
} from "./behaviorModes.js";
import type { RoomTemplateSnapshot, TemplateLimitSnapshot } from "./types.js";

export const NATURAL_DRIP_MIN_SECONDS = 5;
export const NATURAL_DRIP_MAX_SECONDS = 20;
export const CREATE_DRIP_MIN_SECONDS = 10;
export const CREATE_DRIP_MAX_SECONDS = 30;

export function rollNaturalDripDelaySeconds(): number {
  return randomIntInclusive(NATURAL_DRIP_MIN_SECONDS, NATURAL_DRIP_MAX_SECONDS);
}

export function rollCreateDripDelaySeconds(): number {
  return randomIntInclusive(CREATE_DRIP_MIN_SECONDS, CREATE_DRIP_MAX_SECONDS);
}

export function initNaturalJoinDripState(
  input: ModeSelectionInput,
  now: Date
): TemplateBehaviorState {
  return {
    mode: "natural_join_drip",
    nextJoinAt: new Date(now.getTime() + rollNaturalDripDelaySeconds() * 1000).toISOString(),
    snapshot: buildTemplateSnapshot(
      input.snapshot,
      input.limit,
      input.template,
      input.availableBotsCount
    ),
  };
}

export function initCreateDripLightState(
  input: ModeSelectionInput,
  now: Date
): TemplateBehaviorState {
  return {
    mode: "create_drip_light",
    nextJoinAt: new Date(now.getTime() + rollCreateDripDelaySeconds() * 1000).toISOString(),
    snapshot: buildTemplateSnapshot(
      input.snapshot,
      input.limit,
      input.template,
      input.availableBotsCount
    ),
  };
}

export function isDripDue(state: TemplateBehaviorState, now: Date): boolean {
  if (!state.nextJoinAt) return true;
  return now.getTime() >= new Date(state.nextJoinAt).getTime();
}

export function advanceDripNextJoinAt(
  state: TemplateBehaviorState,
  mode: "natural_join_drip" | "create_drip_light",
  now: Date
): void {
  const delaySeconds =
    mode === "natural_join_drip"
      ? rollNaturalDripDelaySeconds()
      : rollCreateDripDelaySeconds();
  state.nextJoinAt = new Date(now.getTime() + delaySeconds * 1000).toISOString();
}

export function buildModeSelectionInput(args: {
  runtime: TemplateRuntimeSnapshot;
  limit: TemplateLimitSnapshot;
  template: RoomTemplateSnapshot;
  availableBotsCount: number;
}): ModeSelectionInput {
  return {
    snapshot: args.runtime,
    limit: args.limit,
    template: args.template,
    availableBotsCount: args.availableBotsCount,
  };
}
