/**
 * Feature-flagged marking engine router (Phase 2).
 * scan = authoritative production path
 * dual = shadow bitmask validation (no user impact)
 * bitmask = only when MARKING_BITMASK_AUTHORITY_ALLOWED=true (post-parity cutover)
 */

import type { Logger } from "../metrics/logger.js";
import type { GlobalCardRegistry } from "../core/card-registry/types.js";
import type { EvaluateOutput } from "../core/winEvaluation.js";
import type { RoomRuntimeState } from "../state/room-state.js";
import type { MarkingEngineMode } from "../config/env.js";
import {
  validateDualModeParity,
  type DualModeValidationContext,
  type DualModeValidationResult,
} from "./dual-mode-validator.js";
import {
  resolveMarkingEnginePolicy,
  type MarkingEnginePolicy,
} from "./marking-engine-policy.js";

export interface MarkDrawOutcome {
  markRows: { ticket_id: string; value: number }[];
  evalOut: EvaluateOutput;
  policy: MarkingEnginePolicy;
  validation?: DualModeValidationResult;
  validationContext?: DualModeValidationContext;
}

export interface ProcessDrawMarkingOptions {
  wasReconciled?: boolean;
}

export function processDrawMarking(
  state: RoomRuntimeState,
  drawNumber: number,
  requestedMode: MarkingEngineMode,
  bitmaskAuthorityAllowed: boolean,
  registry: GlobalCardRegistry | null,
  log: Logger,
  opts: ProcessDrawMarkingOptions = {}
): MarkDrawOutcome {
  const policy = resolveMarkingEnginePolicy(
    requestedMode,
    bitmaskAuthorityAllowed,
    log
  );

  if (policy.effective === "scan" || !registry) {
    const markRows = state.applyMarkForDrawScan(drawNumber);
    const evalOut = state.evaluateDrawScan(drawNumber);
    return { markRows, evalOut, policy };
  }

  if (policy.effective === "bitmask") {
    const { markRows, evalOut } = state.applyMarkAndEvaluateBitmask(
      drawNumber,
      registry
    );
    return { markRows, evalOut, policy };
  }

  // dual shadow — scan authoritative, bitmask validated in isolation
  state.syncMasksFromMarks(registry);
  const preDrawMarks = new Map<string, Set<number>>();
  for (const [ticketId, values] of state.getMarks()) {
    preDrawMarks.set(ticketId, new Set(values));
  }
  const bitmaskSnapshot = state.snapshotForBitmaskCompare();

  const scanMarkRows = state.applyMarkForDrawScan(drawNumber);
  const scanEval = state.evaluateDrawScan(drawNumber);

  const bitmaskOutcome = state.applyMarkAndEvaluateBitmaskOnSnapshot(
    drawNumber,
    registry,
    bitmaskSnapshot,
    preDrawMarks
  );

  const drawn = [...state.getDrawnNumbers()];
  if (!drawn.includes(drawNumber)) drawn.push(drawNumber);

  const context: DualModeValidationContext = {
    roomId: state.roomId,
    drawNumber,
    drawSequence: drawn,
    drawsProcessed: state.drawsProcessed,
    wasReconciled: opts.wasReconciled === true,
    hasUnprocessedDraw: state.hasUnprocessedDraw(),
    firstLineDrawNumber: state.room.first_line_draw_number,
    ticketCount: state.getTickets().length,
  };

  const postScanMarks = new Map<string, Set<number>>();
  for (const [ticketId, values] of state.getMarks()) {
    postScanMarks.set(ticketId, new Set(values));
  }

  const validation = validateDualModeParity({
    context,
    scan: {
      markRows: scanMarkRows,
      evalOut: scanEval,
      markedByTicket: postScanMarks,
    },
    bitmask: {
      markRows: bitmaskOutcome.markRows,
      evalOut: bitmaskOutcome.evalOut,
      maskByTicket: bitmaskOutcome.maskByTicket,
    },
    ticketCardId: state.assignments.ticketCardId,
    registry,
  });

  return {
    markRows: scanMarkRows,
    evalOut: scanEval,
    policy,
    validation,
    validationContext: context,
  };
}
