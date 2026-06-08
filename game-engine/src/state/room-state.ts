/**
 * In-memory runtime state for one playing room.
 * Engine-owned; DB is persistence only.
 */

import type { TicketCard, EvaluateOutput } from "../core/index.js";
import { evaluateRoomAfterDraw } from "../core/index.js";
import type { ResultRow, RoomRow, TicketRow } from "../repositories/types.js";
import { normalizePoolCardId } from "./cardId.js";

const EVAL_STATUSES = new Set(["reserved", "confirmed", "consumed"]);

export interface CardCell {
  value: number;
  rowNo: number;
}

export interface RoomStateSnapshot {
  room: RoomRow;
  tickets: TicketRow[];
  cellsByCard: Map<string, CardCell[]>;
  markedByTicket: Map<string, Set<number>>;
  existingLineTickets: Set<string>;
  existingFullTickets: Set<string>;
  drawnNumbers: number[];
  unprocessedDrawNumbers: Set<number>;
}

export class RoomRuntimeState {
  readonly roomId: string;
  room: RoomRow;
  readonly tickets: TicketRow[];
  private ticketCards: TicketCard[] = [];
  readonly cellsByCard: Map<string, CardCell[]>;
  readonly markedByTicket: Map<string, Set<number>>;
  readonly existingLineTickets: Set<string>;
  readonly existingFullTickets: Set<string>;
  private readonly drawnNumbers: number[];
  private readonly unprocessedDrawNumbers: Set<number>;
  drawsProcessed = 0;

  constructor(snapshot: RoomStateSnapshot) {
    this.roomId = snapshot.room.id;
    this.room = snapshot.room;
    this.tickets = snapshot.tickets;
    this.cellsByCard = snapshot.cellsByCard;
    this.markedByTicket = snapshot.markedByTicket;
    this.existingLineTickets = snapshot.existingLineTickets;
    this.existingFullTickets = snapshot.existingFullTickets;
    this.drawnNumbers = [...snapshot.drawnNumbers];
    this.unprocessedDrawNumbers = new Set(snapshot.unprocessedDrawNumbers);

    this.rebuildTicketCards();
  }

  private rebuildTicketCards(): void {
    this.ticketCards = this.tickets.map((t) => ({
      ticketId: t.id,
      userId: t.player_user_id,
      cells: (this.cellsByCard.get(normalizePoolCardId(t.pool_card_id)) ?? []).map(
        (c) => ({
          value: c.value,
          rowNo: c.rowNo,
        })
      ),
    }));
  }

  getTicketCards(): readonly TicketCard[] {
    return this.ticketCards;
  }

  totalCellRows(): number {
    let n = 0;
    for (const cells of this.cellsByCard.values()) n += cells.length;
    return n;
  }

  static isBroken(state: RoomRuntimeState): boolean {
    return state.getTickets().length > 0 && state.totalCellRows() === 0;
  }

  /** Union DB marks into memory before evaluation (checkpoint/failed-job recovery). */
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
    if (this.room.first_line_draw_number == null) {
      const firstLine = results.find((r) => r.win_type === "line");
      if (firstLine) {
        this.room = { ...this.room, first_line_draw_number: firstLine.draw_number };
      }
    }
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

  recordDrawInserted(drawNumber: number): void {
    if (!this.drawnNumbers.includes(drawNumber)) {
      this.drawnNumbers.push(drawNumber);
    }
    this.unprocessedDrawNumbers.add(drawNumber);
  }

  /** Reconcile scheduler/backpressure fields with authoritative DB state. */
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
  }

  /** Apply marks for this draw in memory only. Returns rows to persist. */
  applyMarkForDraw(drawNumber: number): { ticket_id: string; value: number }[] {
    const rows: { ticket_id: string; value: number }[] = [];
    for (const ticket of this.tickets) {
      const cells = this.cellsByCard.get(normalizePoolCardId(ticket.pool_card_id)) ?? [];
      if (!cells.some((c) => c.value === drawNumber)) continue;
      rows.push({ ticket_id: ticket.id, value: drawNumber });
      let marked = this.markedByTicket.get(ticket.id);
      if (!marked) {
        marked = new Set();
        this.markedByTicket.set(ticket.id, marked);
      }
      marked.add(drawNumber);
    }
    return rows;
  }

  evaluateDraw(drawNumber: number): EvaluateOutput {
    return evaluateRoomAfterDraw({
      drawNumber,
      firstLineDrawNumber: this.room.first_line_draw_number,
      markedByTicket: this.markedByTicket,
      tickets: this.ticketCards,
      existingLineTickets: this.existingLineTickets,
      existingFullTickets: this.existingFullTickets,
    });
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
}
