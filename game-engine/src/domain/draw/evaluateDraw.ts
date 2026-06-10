/**
 * Engine-mode draw evaluation — port of:
 *   game_core.rpc_apply_marks_for_draw  (insert marks for the drawn number)
 *   public.fn_evaluate_room_after_draw  (derive line/full winners, settle)
 *
 * Settlement itself (fn_finish_room_and_settle) stays a DB RPC: it is the atomic
 * money path (KEEP). The engine only decides WHEN to settle (full winner found)
 * exactly as the SQL does, then calls the RPC.
 *
 * Runtime architecture (engine-owned state):
 *   - Room snapshot loaded once via RoomStateManager
 *   - Draw loop: memory apply → memory evaluate → persistence writes only
 */

import { settleRoomIfNeeded } from "../../finance/settleRoom.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";
import {
  type DrawStepBreakdown,
  emptyBreakdown,
  timedStep,
  timedStepSync,
} from "../../metrics/drawPerformance.js";
import { GameRepo } from "../../repositories/index.js";
import { reconcileRuntimeStateFromDb } from "../../state/reconcileFromDb.js";
import type { RoomRuntimeState } from "../../state/room-state.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";

export interface DrawPersistencePayload {
  marks: { ticket_id: string; value: number }[];
  results: {
    room_id: string;
    user_id: string;
    ticket_id: string;
    win_type: string;
    draw_number: number;
  }[];
  setFirstLineDrawNumber: boolean;
}

export interface EvaluateDrawResult {
  marksInserted: number;
  newResults: number;
  settled: boolean;
  fullWinnerThisDraw: boolean;
  ticketCount: number;
  cardCount: number;
  cardNumberRows: number;
  marksReadCount: number;
  breakdown: DrawStepBreakdown;
  persistence?: DrawPersistencePayload;
}

/**
 * Engine draw path — memory state, no DB reads in hot path.
 * Persistence: marks, results, job completion handled by caller.
 */
export interface EvaluateDrawOptions {
  /** When false, caller persists via rpc_finalize_engine_draw_job. */
  persist?: boolean;
  /** When true, caller runs settlement after persistence (engine batch path). */
  deferSettlement?: boolean;
  /** Force DB reconcile before evaluate (default: auto via needsReconcile). */
  syncFromDb?: boolean;
}

export async function applyMarksAndEvaluateWithState(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  state: RoomRuntimeState,
  stateManager: RoomStateManager,
  drawNumber: number,
  opts: EvaluateDrawOptions = {}
): Promise<EvaluateDrawResult> {
  const persist = opts.persist !== false;
  const deferSettlement = opts.deferSettlement === true;
  const checkpointEvery = stateManager.getCheckpointEvery();
  const shouldReconcile =
    opts.syncFromDb === true ||
    (opts.syncFromDb !== false &&
      state.needsReconcile(checkpointEvery));
  const now = new Date().toISOString();
  const breakdown = emptyBreakdown();

  if (shouldReconcile) {
    const syncStep = await timedStep(() => reconcileRuntimeStateFromDb(repo, state));
    breakdown.getMarksForTickets = syncStep.timing;
    breakdown.getResults = syncStep.timing;
    state.noteReconcileDone();
    log.info("room state reconciled from db", {
      roomId: state.roomId,
      drawNumber,
      drawsProcessed: state.drawsProcessed,
    });
  }

  const memoryStep = timedStepSync(() => {
    const rows = state.applyMarkForDraw(drawNumber);
    const evalOut = state.evaluateDraw(drawNumber);
    return { rows, evalOut };
  });
  breakdown.evaluateRoomAfterDraw = memoryStep.timing;
  const { rows, evalOut } = memoryStep.result;
  state.absorbEvaluation(evalOut, drawNumber);

  const resultRows = evalOut.newResults.map((r) => ({
    room_id: state.roomId,
    user_id: r.userId,
    ticket_id: r.ticketId,
    win_type: r.winType,
    draw_number: drawNumber,
  }));

  if (persist) {
    const insertMarksStep = await timedStep(() => repo.insertMarksForDraw(rows, now));
    breakdown.insertMarksForDraw = insertMarksStep.timing;

    const insertResultsStep = await timedStep(async () => {
      await repo.insertResults(resultRows);
      if (evalOut.setFirstLineDrawNumber) {
        await repo.setFirstLineDrawNumber(state.roomId, drawNumber);
      }
    });
    breakdown.insertResults = insertResultsStep.timing;
  }

  state.recordDrawProcessed(drawNumber);

  let settled = false;
  if (!deferSettlement) {
    const settleStep = await timedStep(() =>
      settleRoomIfNeeded(supabase, repo, state.roomId, {
        fullWinnerThisDraw: evalOut.fullWinnerThisDraw,
      })
    );
    if (settleStep.result) {
      breakdown.fn_finish_room_and_settle = settleStep.timing;
      settled = true;
      stateManager.evict(state.roomId);
      log.info("room settled (full winner)", { roomId: state.roomId, drawNumber });
    }
  }
  if (!settled && !evalOut.fullWinnerThisDraw) {
    await stateManager.maybeCheckpoint(state);
  }

  const poolCardIds = new Set(
    state.getTickets().map((t) => String(t.pool_card_id))
  );

  return {
    marksInserted: rows.length,
    newResults: evalOut.newResults.length,
    settled,
    fullWinnerThisDraw: evalOut.fullWinnerThisDraw,
    ticketCount: state.getTickets().length,
    cardCount: poolCardIds.size,
    cardNumberRows: state.totalCellRows(),
    marksReadCount: state.marksReadCount(),
    breakdown,
    persistence: persist
      ? undefined
      : {
          marks: rows,
          results: resultRows,
          setFirstLineDrawNumber: evalOut.setFirstLineDrawNumber,
        },
  };
}

/** Convenience wrapper — loads state via manager if needed. */
export async function applyMarksAndEvaluate(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  stateManager: RoomStateManager,
  roomId: string,
  drawNumber: number,
  opts: EvaluateDrawOptions = {}
): Promise<EvaluateDrawResult> {
  const state = await stateManager.ensureLoaded(roomId);
  return applyMarksAndEvaluateWithState(
    supabase,
    repo,
    log,
    state,
    stateManager,
    drawNumber,
    opts
  );
}
