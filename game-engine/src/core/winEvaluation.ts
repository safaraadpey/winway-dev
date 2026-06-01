/**
 * Win evaluation — faithful port of public.fn_evaluate_room_after_draw.
 *
 * A bingo card (housie 3x9) has 15 numbers spread across 3 rows. The DB derives
 * wins per ticket from `card_numbers` (value + row_no) joined to `marks`:
 *   - LINE: any single row is fully marked (row_marked == row_total).
 *   - FULL: every cell on the card is marked (marked_cells == total_cells).
 *
 * Important rule preserved from the SQL:
 *   - LINE wins are only *credited on the draw that produced the first line in
 *     the room*. The room stores `first_line_draw_number`; once set, later
 *     line completions are NOT recorded as new line results
 *     (`WHERE v_first_line_draw IS NULL OR v_first_line_draw = p_draw_number`).
 *   - FULL wins are always recorded.
 *   - A ticket that already has a result of a given win_type is skipped
 *     (idempotency, mirrored by NOT EXISTS + ON CONFLICT DO NOTHING).
 */

export interface CardCell {
  /** Bingo number printed on the cell. */
  value: number;
  /** Row index 1..3 (housie). */
  rowNo: number;
}

export interface TicketCard {
  ticketId: string;
  userId: string;
  cells: readonly CardCell[];
}

export type WinType = "line" | "full";

export interface WinResult {
  ticketId: string;
  userId: string;
  winType: WinType;
}

export interface EvaluateInput {
  drawNumber: number;
  /** Room's current first_line_draw_number (null until first line happens). */
  firstLineDrawNumber: number | null;
  /** All marked numbers per ticket id (the union of draws hitting that card). */
  markedByTicket: ReadonlyMap<string, ReadonlySet<number>>;
  tickets: readonly TicketCard[];
  /** Tickets that already have a recorded result of each type (idempotency). */
  existingLineTickets?: ReadonlySet<string>;
  existingFullTickets?: ReadonlySet<string>;
}

export interface EvaluateOutput {
  /** New winner rows to insert into `results` for this draw. */
  newResults: WinResult[];
  /** True when a line was recorded this draw and the room had none before. */
  setFirstLineDrawNumber: boolean;
  /** True when at least one FULL winner exists for this draw → room settles. */
  fullWinnerThisDraw: boolean;
}

interface TicketAnalysis {
  ticketId: string;
  userId: string;
  totalCells: number;
  markedCells: number;
  rowFullyMarked: boolean;
}

function analyze(
  ticket: TicketCard,
  marked: ReadonlySet<number>
): TicketAnalysis {
  const rowTotal = new Map<number, Set<number>>();
  const rowMarked = new Map<number, Set<number>>();
  const allValues = new Set<number>();
  const markedValues = new Set<number>();

  for (const cell of ticket.cells) {
    allValues.add(cell.value);
    if (!rowTotal.has(cell.rowNo)) rowTotal.set(cell.rowNo, new Set());
    rowTotal.get(cell.rowNo)!.add(cell.value);

    if (marked.has(cell.value)) {
      markedValues.add(cell.value);
      if (!rowMarked.has(cell.rowNo)) rowMarked.set(cell.rowNo, new Set());
      rowMarked.get(cell.rowNo)!.add(cell.value);
    }
  }

  let rowFullyMarked = false;
  for (const [row, totals] of rowTotal) {
    const markedInRow = rowMarked.get(row)?.size ?? 0;
    if (totals.size > 0 && markedInRow === totals.size) {
      rowFullyMarked = true;
      break;
    }
  }

  return {
    ticketId: ticket.ticketId,
    userId: ticket.userId,
    totalCells: allValues.size,
    markedCells: markedValues.size,
    rowFullyMarked,
  };
}

export function evaluateRoomAfterDraw(input: EvaluateInput): EvaluateOutput {
  const existingLine = input.existingLineTickets ?? new Set<string>();
  const existingFull = input.existingFullTickets ?? new Set<string>();
  const lineGateOpen =
    input.firstLineDrawNumber === null ||
    input.firstLineDrawNumber === input.drawNumber;

  const newResults: WinResult[] = [];
  let lineRecorded = false;
  let fullRecorded = false;

  for (const ticket of input.tickets) {
    const marked = input.markedByTicket.get(ticket.ticketId) ?? new Set<number>();
    const a = analyze(ticket, marked);

    // LINE candidate: a full row, no prior line result, and the line gate open.
    if (a.rowFullyMarked && !existingLine.has(a.ticketId) && lineGateOpen) {
      newResults.push({ ticketId: a.ticketId, userId: a.userId, winType: "line" });
      lineRecorded = true;
    }

    // FULL candidate: every cell marked, no prior full result.
    if (
      a.totalCells > 0 &&
      a.markedCells === a.totalCells &&
      !existingFull.has(a.ticketId)
    ) {
      newResults.push({ ticketId: a.ticketId, userId: a.userId, winType: "full" });
      fullRecorded = true;
    }
  }

  return {
    newResults,
    setFirstLineDrawNumber:
      input.firstLineDrawNumber === null && lineRecorded,
    fullWinnerThisDraw: fullRecorded,
  };
}
