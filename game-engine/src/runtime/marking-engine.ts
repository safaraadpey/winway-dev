/**
 * Bitmask marking engine — authoritative draw evaluation path.
 */

import type { GlobalCardRegistry } from "../core/card-registry/types.js";
import type { EvaluateOutput } from "../core/evaluation-types.js";
import type { RoomRuntimeState } from "../state/room-state.js";

export interface MarkDrawOutcome {
  markRows: { ticket_id: string; value: number }[];
  evalOut: EvaluateOutput;
}

export function processDrawMarking(
  state: RoomRuntimeState,
  drawNumber: number,
  registry: GlobalCardRegistry
): MarkDrawOutcome {
  return state.applyMarkAndEvaluateBitmask(drawNumber, registry);
}
