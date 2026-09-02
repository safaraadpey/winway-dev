/**
 * RAM-only draw evaluation for the room clock — no DB reconcile, checkpoint, or registry load.
 */
import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import { processDrawMarking } from "../../runtime/marking-engine.js";
import type { RoomRuntimeState } from "../../state/room-state.js";
import type { DrawPersistencePayload } from "../draw/evaluateDraw.js";

export interface RamDrawEvaluation {
  persistence: DrawPersistencePayload;
  fullWinnerThisDraw: boolean;
}

export function evaluateDrawInRam(
  state: RoomRuntimeState,
  drawNumber: number,
  registry: GlobalCardRegistry
): RamDrawEvaluation {
  state.syncMasksFromMarks(registry);
  const { markRows, evalOut } = processDrawMarking(state, drawNumber, registry);
  state.absorbEvaluation(evalOut, drawNumber);
  state.syncMasksFromMarks(registry);

  const persistence: DrawPersistencePayload = {
    marks: markRows,
    results: evalOut.newResults.map((r) => ({
      room_id: state.roomId,
      user_id: r.userId,
      ticket_id: r.ticketId,
      win_type: r.winType,
      draw_number: drawNumber,
    })),
    setFirstLineDrawNumber: evalOut.setFirstLineDrawNumber,
  };

  return {
    persistence,
    fullWinnerThisDraw: evalOut.fullWinnerThisDraw,
  };
}
