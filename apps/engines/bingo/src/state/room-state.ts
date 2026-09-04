/**
 * In-memory runtime state for one playing room.
 * Engine-owned; DB is persistence only.
 */

import type { EvaluateOutput } from "../core/evaluation-types.js";
import {
  applyMarkForDrawBitmask,
  evaluateRoomAfterDrawBitmask,
  maskFromMarkedValues,
} from "../core/bitmask/index.js";
import type { GlobalCardRegistry } from "../core/card-registry/types.js";
import type { DingSettleMode, ResultRow, RoomRow, TicketRow } from "../repositories/types.js";
import {
  accumulateDrawDingCredits,
  buildRoomFinalizationDingPayload,
  isRoomLevelDing,
  pendingDingForUser,
  snapshotRoomDing,
  type RoomFinalizationDingPayload,
} from "../domain/ding/roomDingState.js";
import {
  buildRoomAssignmentIndex,
  type RoomAssignmentIndex,
} from "../runtime/room-assignments.js";
import { normalizePoolCardId } from "./cardId.js";

const EVAL_STATUSES = new Set(["reserved", "confirmed", "consumed"]);
const CELLS_PER_CARD = 15;

export interface RoomStateSnapshot {
  room: RoomRow;
  tickets: TicketRow[];
  markedByTicket: Map<string, Set<number>>;
  existingLineTickets: Set<string>;
  existingFullTickets: Set<string>;
  drawnNumbers: number[];
  unprocessedDrawNumbers: Set<number>;
  templateDingPerNumber: number | null;
}

export class RoomRuntimeState {
  readonly roomId: string;
  room: RoomRow;
  readonly tickets: TicketRow[];
  readonly markedByTicket: Map<string, Set<number>>;
  readonly existingLineTickets: Set<string>;
  readonly existingFullTickets: Set<string>;
  private readonly drawnNumbers: number[];
  private readonly unprocessedDrawNumbers: Set<number>;
  readonly templateDingPerNumber: number | null;

  /** Per-room assignment index: cardId → ticketIds */
  readonly assignments: RoomAssignmentIndex;
  /** Per-room card masks: ticketId → 15-bit mask */
  readonly maskByTicket: Map<string, number>;

  /** Accumulated pending Ding for room_level settlement (no ledger writes until finish). */
  readonly roomDingPending = new Map<string, number>();
  /** Clock fence: no further picks after the first full-house evaluation. */
  private fullHouseFrozen = false;

  drawsProcessed = 0;
  /** Highest draw_number processed in this engine session (ordering guard). */
  lastProcessedDrawNumber: number | null = null;
  private reconcileAfterLoad = false;
  private forceReconcile = false;

  constructor(snapshot: RoomStateSnapshot) {
    this.roomId = snapshot.room.id;
    this.room = snapshot.room;
    this.tickets = snapshot.tickets;
    this.markedByTicket = snapshot.markedByTicket;
    this.existingLineTickets = snapshot.existingLineTickets;
    this.existingFullTickets = snapshot.existingFullTickets;
    this.drawnNumbers = [...snapshot.drawnNumbers];
    this.unprocessedDrawNumbers = new Set(snapshot.unprocessedDrawNumbers);
    this.templateDingPerNumber = snapshot.templateDingPerNumber;

    this.assignments = buildRoomAssignmentIndex(this.tickets);
    this.maskByTicket = new Map();
  }

  getDingSettleMode(): DingSettleMode {
    return this.room.ding_settle_mode ?? "per_draw";
  }

  usesRoomLevelDing(): boolean {
    return isRoomLevelDing(this.getDingSettleMode());
  }

  accumulateRoomDing(credits: readonly { user_id: string; amount: number }[]): void {
    if (!this.usesRoomLevelDing()) return;
    accumulateDrawDingCredits(this.roomDingPending, credits);
  }

  replaceRoomDingPending(from: ReadonlyMap<string, number>): void {
    this.roomDingPending.clear();
    for (const [userId, amount] of from) {
      if (amount > 0) this.roomDingPending.set(userId, amount);
    }
  }

  getPendingDingForUser(userId: string): number {
    return pendingDingForUser(this.roomDingPending, userId);
  }

  getRoomDingSnapshot() {
    return snapshotRoomDing(this.roomDingPending);
  }

  buildRoomDingFinalizationPayload(): RoomFinalizationDingPayload {
    return buildRoomFinalizationDingPayload(this.roomId, this.roomDingPending);
  }

  freezeAfterFullHouse(): void {
    this.fullHouseFrozen = true;
  }

  isFullHouseFrozen(): boolean {
    return this.fullHouseFrozen;
  }

  getUnprocessedDrawNumbers(): readonly number[] {
    return [...this.unprocessedDrawNumbers];
  }

  getProcessedDrawNumbers(): number[] {
    return this.drawnNumbers.filter((n) => !this.unprocessedDrawNumbers.has(n));
  }

  marksByProcessedDraw(): Map<number, { ticket_id: string; value: number }[]> {
    const marksByDraw = new Map<number, { ticket_id: string; value: number }[]>();
    for (const drawNumber of this.getProcessedDrawNumbers()) {
      const rows: { ticket_id: string; value: number }[] = [];
      for (const ticket of this.tickets) {
        if (this.markedByTicket.get(ticket.id)?.has(drawNumber)) {
          rows.push({ ticket_id: ticket.id, value: drawNumber });
        }
      }
      marksByDraw.set(drawNumber, rows);
    }
    return marksByDraw;
  }

  countDingMatchedByUser(
    marks: readonly { ticket_id: string; value: number }[],
    drawNumber: number
  ): Map<string, number> {
    const ticketById = new Map(this.tickets.map((t) => [t.id, t]));
    const matched = new Map<string, number>();
    for (const mark of marks) {
      if (mark.value !== drawNumber) continue;
      const ticket = ticketById.get(mark.ticket_id);
      if (!ticket || ticket.cancelled_at !== null) continue;
      if (ticket.reservation_status !== "reserved") continue;
      matched.set(
        ticket.player_user_id,
        (matched.get(ticket.player_user_id) ?? 0) + 1
      );
    }
    return matched;
  }

  totalCellRows(): number {
    return this.tickets.length * CELLS_PER_CARD;
  }

  static isBroken(_state: RoomRuntimeState): boolean {
    return false;
  }

  /** Rebuild bitmask state from marked sets + global card registry. */
  syncMasksFromMarks(registry: GlobalCardRegistry): void {
    for (const ticket of this.tickets) {
      const cardId = normalizePoolCardId(ticket.pool_card_id);
      const valueToBit = registry.valueToBitByCard.get(cardId);
      if (!valueToBit) continue;
      const marked = this.markedByTicket.get(ticket.id) ?? new Set<number>();
      this.maskByTicket.set(
        ticket.id,
        maskFromMarkedValues(marked, valueToBit)
      );
    }
  }

  mergeMarksFromDb(dbMarks: ReadonlyMap<string, ReadonlySet<number>>): void {
    for (const ticket of this.tickets) {
      const fromDb = dbMarks.get(ticket.id);
      if (!fromDb || fromDb.size === 0) continue;
      let marked = this.markedByTicket.get(ticket.id);
      if (!marked) {
        marked = new Set();
        this.markedByTicket.set(ticket.id, marked);
      }
      for (const value of fromDb) marked.add(value);
    }
  }

  syncExistingResults(results: readonly ResultRow[]): void {
    for (const r of results) {
      if (r.win_type === "line") this.existingLineTickets.add(r.ticket_id);
      else if (r.win_type === "full") this.existingFullTickets.add(r.ticket_id);
    }
    this.applyFirstLineFromResultsIfUnset(results);
  }

  /** Authoritative replace from DB (reconcile / pre-eval refresh). */
  replaceExistingResultsFromDb(results: readonly ResultRow[]): void {
    this.existingLineTickets.clear();
    this.existingFullTickets.clear();
    for (const r of results) {
      if (r.win_type === "line") this.existingLineTickets.add(r.ticket_id);
      else if (r.win_type === "full") this.existingFullTickets.add(r.ticket_id);
    }
    this.applyFirstLineFromResultsIfUnset(results);
  }

  private applyFirstLineFromResultsIfUnset(results: readonly ResultRow[]): void {
    if (this.room.first_line_draw_number == null) {
      const firstLine = results.find((r) => r.win_type === "line");
      if (firstLine) {
        this.room = { ...this.room, first_line_draw_number: firstLine.draw_number };
      }
    }
  }

  isOutOfOrderDraw(drawNumber: number): boolean {
    return (
      this.lastProcessedDrawNumber != null &&
      drawNumber < this.lastProcessedDrawNumber
    );
  }

  getTickets(): readonly TicketRow[] {
    return this.tickets;
  }

  getMarks(): ReadonlyMap<string, ReadonlySet<number>> {
    return this.markedByTicket;
  }

  getDrawnNumbers(): readonly number[] {
    return this.drawnNumbers;
  }

  hasUnprocessedDraw(): boolean {
    return this.unprocessedDrawNumbers.size > 0;
  }

  /** True when a draw inserted *before* this ball is still unprocessed (insertion order). */
  hasEarlierUnprocessedDraw(drawNumber: number): boolean {
    const idx = this.drawnNumbers.indexOf(drawNumber);
    if (idx < 0) {
      for (const n of this.unprocessedDrawNumbers) {
        if (n !== drawNumber) return true;
      }
      return false;
    }
    for (let i = 0; i < idx; i++) {
      const earlier = this.drawnNumbers[i]!;
      if (this.unprocessedDrawNumbers.has(earlier)) return true;
    }
    return false;
  }

  recordDrawInserted(drawNumber: number): void {
    if (!this.drawnNumbers.includes(drawNumber)) {
      this.drawnNumbers.push(drawNumber);
    }
    this.unprocessedDrawNumbers.add(drawNumber);
  }

  syncDrawSchedulerState(drawnNumbers: number[], unprocessedDrawNumbers: number[]): void {
    this.drawnNumbers.length = 0;
    this.drawnNumbers.push(...drawnNumbers);
    this.unprocessedDrawNumbers.clear();
    for (const n of unprocessedDrawNumbers) {
      this.unprocessedDrawNumbers.add(n);
    }
  }

  recordDrawProcessed(drawNumber: number): void {
    this.unprocessedDrawNumbers.delete(drawNumber);
    this.drawsProcessed += 1;
    if (
      this.lastProcessedDrawNumber == null ||
      drawNumber > this.lastProcessedDrawNumber
    ) {
      this.lastProcessedDrawNumber = drawNumber;
    }
  }

  /** Bitmask path — O(affected_cards) marking + full-room win check. */
  applyMarkAndEvaluateBitmask(
    drawNumber: number,
    registry: GlobalCardRegistry
  ): { markRows: { ticket_id: string; value: number }[]; evalOut: EvaluateOutput } {
    this.syncMasksFromMarks(registry);

    const markResult = applyMarkForDrawBitmask({
      drawNumber,
      numberIndex: registry.numberIndex,
      assignmentsByCardId: this.assignments.assignmentsByCardId,
      maskByTicket: this.maskByTicket,
    });

    for (const row of markResult.markRows) {
      let marked = this.markedByTicket.get(row.ticket_id);
      if (!marked) {
        marked = new Set();
        this.markedByTicket.set(row.ticket_id, marked);
      }
      marked.add(row.value);
    }

    const evalOut = evaluateRoomAfterDrawBitmask({
      drawNumber,
      firstLineDrawNumber: this.room.first_line_draw_number,
      maskByTicket: this.maskByTicket,
      ticketCardId: this.assignments.ticketCardId,
      ticketUserId: this.assignments.ticketUserId,
      cardDefs: registry.definitions,
      existingLineTickets: this.existingLineTickets,
      existingFullTickets: this.existingFullTickets,
    });

    return { markRows: markResult.markRows, evalOut };
  }

  absorbEvaluation(evalOut: EvaluateOutput, drawNumber: number): void {
    for (const r of evalOut.newResults) {
      if (r.winType === "line") this.existingLineTickets.add(r.ticketId);
      else this.existingFullTickets.add(r.ticketId);
    }
    if (evalOut.setFirstLineDrawNumber) {
      this.room = { ...this.room, first_line_draw_number: drawNumber };
    }
  }

  marksReadCount(): number {
    let n = 0;
    for (const marked of this.markedByTicket.values()) n += marked.size;
    return n;
  }

  static filterEvalTickets(tickets: TicketRow[]): TicketRow[] {
    return tickets.filter((t) => EVAL_STATUSES.has(t.reservation_status));
  }

  markLoadedFromDb(): void {
    this.reconcileAfterLoad = true;
  }

  requestReconcile(): void {
    this.forceReconcile = true;
  }

  needsReconcile(checkpointEvery: number, drawNumber?: number): boolean {
    if (this.reconcileAfterLoad || this.forceReconcile) return true;
    if (drawNumber != null && this.isOutOfOrderDraw(drawNumber)) return true;
    if (checkpointEvery <= 0) return false;
    return this.drawsProcessed > 0 && this.drawsProcessed % checkpointEvery === 0;
  }

  noteReconcileDone(): void {
    this.reconcileAfterLoad = false;
    this.forceReconcile = false;
  }
}
