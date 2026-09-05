/**
 * Versioned finalization wrapper — same contract from live RAM stop or replayGame.
 */
import { resolveRewardPercentages, splitPrizePool } from "../../core/prizeSplit.js";
import {
  ROOM_DING_SETTLEMENT_VERSION,
  roomDingSettlementKey,
} from "../ding/roomDingState.js";
import type { RoomRuntimeState } from "../../state/room-state.js";
import { computeFinalizationChecksums } from "./finalizationChecksum.js";
import type {
  GameFinalizationResult,
  GameReplayMark,
  GameReplayResult,
  GameReplayWinner,
} from "./types.js";
import { FINALIZATION_CONTRACT_VERSION } from "./finalizationChecksum.js";
import { RNG_ALGORITHM, RNG_VERSION } from "./types.js";

function sortWinners(rows: GameReplayWinner[]): GameReplayWinner[] {
  return [...rows].sort((a, b) => a.ticketId.localeCompare(b.ticketId));
}

function sortMarks(rows: GameReplayMark[]): GameReplayMark[] {
  return [...rows].sort((a, b) => {
    const t = a.ticketId.localeCompare(b.ticketId);
    return t !== 0 ? t : a.value - b.value;
  });
}

/** Build GameReplayResult from resident Engine RAM (live stop path). */
export function buildReplayResultFromState(
  state: RoomRuntimeState,
  commissionPool: number
): GameReplayResult {
  const room = state.room;
  const drawSequence = [...state.getDrawnNumbers()];
  const marks: GameReplayMark[] = [];
  for (const [ticketId, values] of state.getMarks()) {
    for (const value of values) {
      marks.push({ ticketId, value });
    }
  }

  const ticketById = new Map(state.getTickets().map((t) => [t.id, t]));
  const lineWinners: GameReplayWinner[] = [];
  for (const [ticketId, drawNumber] of state.getLineWinnerDraws()) {
    const ticket = ticketById.get(ticketId);
    if (!ticket) continue;
    lineWinners.push({
      ticketId,
      userId: ticket.player_user_id,
      drawNumber,
    });
  }
  const fullWinners: GameReplayWinner[] = [];
  for (const [ticketId, drawNumber] of state.getFullWinnerDraws()) {
    const ticket = ticketById.get(ticketId);
    if (!ticket) continue;
    fullWinners.push({
      ticketId,
      userId: ticket.player_user_id,
      drawNumber,
    });
  }

  const pct = resolveRewardPercentages(
    room.line_reward_percentage,
    room.full_reward_percentage,
    null,
    null
  );
  const prize = splitPrizePool({
    totalPool: commissionPool,
    linePct: pct.linePct,
    fullPct: pct.fullPct,
    lineWinners: lineWinners.length,
    fullWinners: fullWinners.length,
  });

  const dingSnap = state.getRoomDingSnapshot();
  const dingByUser = [...dingSnap.pendingByUser.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => a.userId.localeCompare(b.userId));

  const stoppedReason = fullWinners.length > 0 ? "full_house" : "exhausted";

  return {
    manifestVersion: 1,
    rngAlgorithm: RNG_ALGORITHM,
    rngVersion: RNG_VERSION,
    drawSequence,
    firstLineDrawNumber: room.first_line_draw_number,
    lineWinners: sortWinners(lineWinners),
    fullWinners: sortWinners(fullWinners),
    marks: sortMarks(marks),
    dingByUser,
    prizePreview: {
      totalPool: commissionPool,
      linePool: prize.linePool,
      fullPool: prize.fullPool,
      lineShare: prize.lineShare,
      fullShare: prize.fullShare,
      lineWinners: lineWinners.length,
      fullWinners: fullWinners.length,
    },
    stoppedReason,
  };
}

export function wrapFinalizationResult(args: {
  roomId: string;
  manifestVersion: number;
  payload: GameReplayResult;
}): GameFinalizationResult {
  const { resultSha256, marksSha256 } = computeFinalizationChecksums({
    roomId: args.roomId,
    manifestVersion: args.manifestVersion,
    rngVersion: args.payload.rngVersion,
    payload: args.payload,
  });

  return {
    contractVersion: FINALIZATION_CONTRACT_VERSION,
    roomId: args.roomId,
    manifestVersion: args.manifestVersion,
    rngAlgorithm: RNG_ALGORITHM,
    rngVersion: args.payload.rngVersion,
    payload: args.payload,
    dingSettlementKey: roomDingSettlementKey(args.roomId),
    dingSettlementVersion: ROOM_DING_SETTLEMENT_VERSION,
    resultSha256,
    marksSha256,
  };
}

/** Live RAM stop → versioned finalization contract. */
export function toFinalizationResultFromState(
  state: RoomRuntimeState,
  commissionPool: number,
  manifestVersion = 1
): GameFinalizationResult {
  const payload = buildReplayResultFromState(state, commissionPool);
  return wrapFinalizationResult({
    roomId: state.roomId,
    manifestVersion,
    payload,
  });
}

/** replayGame output → same contract (crash recovery path). */
export function toFinalizationResultFromReplay(
  roomId: string,
  manifestVersion: number,
  payload: GameReplayResult
): GameFinalizationResult {
  return wrapFinalizationResult({ roomId, manifestVersion, payload });
}
