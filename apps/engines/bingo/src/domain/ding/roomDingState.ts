/**
 * In-RAM accumulation of pending Ding for room_level settlement.
 * Engine is the sole calculator; SQL applies the final payload atomically.
 */

import { computeDingCredits, resolveDingPerCard } from "../../core/ding.js";
import type { RoomRuntimeState } from "../../state/room-state.js";
import type { DingSettleMode } from "../../repositories/types.js";

export const ROOM_DING_SETTLEMENT_VERSION = 1;

export function roomDingSettlementKey(roomId: string): string {
  return `bingo.ding_room:${roomId}:v${ROOM_DING_SETTLEMENT_VERSION}`;
}

export interface RoomDingCredit {
  userId: string;
  totalDing: number;
}

export interface RoomDingSnapshot {
  pendingByUser: ReadonlyMap<string, number>;
  totalPending: number;
}

export interface RoomFinalizationDingPayload {
  roomId: string;
  settlementKey: string;
  settlementVersion: number;
  dingCredits: RoomDingCredit[];
}

export function isRoomLevelDing(mode: DingSettleMode | null | undefined): boolean {
  return mode === "room_level";
}

/** Fold per-draw credits into running room totals (live path). */
export function accumulateDrawDingCredits(
  pending: Map<string, number>,
  credits: readonly { user_id: string; amount: number }[]
): void {
  for (const credit of credits) {
    if (credit.amount <= 0) continue;
    pending.set(credit.user_id, (pending.get(credit.user_id) ?? 0) + credit.amount);
  }
}

export function snapshotRoomDing(pending: ReadonlyMap<string, number>): RoomDingSnapshot {
  let totalPending = 0;
  for (const amount of pending.values()) totalPending += amount;
  return { pendingByUser: pending, totalPending };
}

export function pendingDingForUser(
  pending: ReadonlyMap<string, number>,
  userId: string
): number {
  return pending.get(userId) ?? 0;
}

export function buildRoomFinalizationDingPayload(
  roomId: string,
  pending: ReadonlyMap<string, number>
): RoomFinalizationDingPayload {
  const dingCredits: RoomDingCredit[] = [];
  for (const [userId, totalDing] of pending) {
    if (totalDing <= 0) continue;
    dingCredits.push({ userId, totalDing });
  }
  dingCredits.sort((a, b) => a.userId.localeCompare(b.userId));
  return {
    roomId,
    settlementKey: roomDingSettlementKey(roomId),
    settlementVersion: ROOM_DING_SETTLEMENT_VERSION,
    dingCredits,
  };
}

export function toRpcDingCredits(
  payload: RoomFinalizationDingPayload
): { user_id: string; amount: number }[] {
  return payload.dingCredits.map((c) => ({
    user_id: c.userId,
    amount: c.totalDing,
  }));
}

/**
 * Replay pending Ding from durable processed draws + marks (crash recovery).
 * Uses reserved-only eligibility — same rule as live per-draw matching.
 */
export function replayRoomDingFromMarks(args: {
  state: RoomRuntimeState;
  processedDrawNumbers: readonly number[];
  marksByDraw: ReadonlyMap<number, readonly { ticket_id: string; value: number }[]>;
}): Map<string, number> {
  const pending = new Map<string, number>();
  const dingPerCard = resolveDingPerCard(
    args.state.room.ding_per_number,
    args.state.templateDingPerNumber
  );

  for (const drawNumber of args.processedDrawNumbers) {
    const marks = args.marksByDraw.get(drawNumber) ?? [];
    const matchedByUser = args.state.countDingMatchedByUser(marks, drawNumber);
    const credits = computeDingCredits({
      drawnNumber: drawNumber,
      dingPerCard,
      matchedCardsByUser: matchedByUser,
    });
    for (const credit of credits) {
      pending.set(credit.userId, (pending.get(credit.userId) ?? 0) + credit.delta);
    }
  }

    return pending;
  }

/** Replace RAM pending with Ding derived only from processed draws + marks. */
export function rebuildRoomDingPendingFromProcessedMarks(state: RoomRuntimeState): void {
  if (!state.usesRoomLevelDing()) return;
  const pending = replayRoomDingFromMarks({
    state,
    processedDrawNumbers: state.getProcessedDrawNumbers(),
    marksByDraw: state.marksByProcessedDraw(),
  });
  state.replaceRoomDingPending(pending);
}
