/**
 * Benchmark: scan-based marking vs bitmask marking.
 *
 * Run: npm run benchmark:marking
 * Does not require DB — uses synthetic card pool + room.
 */

import { buildRegistryFromCardNumbers } from "../core/card-registry/build.js";
import { evaluateRoomAfterDrawBitmask } from "../core/bitmask/winEvaluation.js";
import { applyMarkForDrawBitmask } from "../core/bitmask/markDraw.js";
import { buildRoomAssignmentIndex } from "../runtime/room-assignments.js";
import type { TicketRow } from "../repositories/types.js";
import type { CardCell, RoomStateSnapshot } from "../state/room-state.js";
import { RoomRuntimeState } from "../state/room-state.js";

const CARD_COUNT = 500;
const TICKETS_PER_ROOM = 250;
const DRAWS_PER_RUN = 90;
const WARMUP_RUNS = 3;
const BENCHMARK_RUNS = 10;

/** Deterministic pseudo-random cell generator for UK housie layout. */
function generateCardPool(count: number) {
  const rows: {
    pool_card_id: string;
    value: number;
    row_no: number;
    col_no: number;
  }[] = [];

  for (let card = 0; card < count; card++) {
    const cardId = `card-${card}`;
    for (let row = 1; row <= 3; row++) {
      const cols = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((c) => (c + row + card) % 3 !== 0).slice(0, 5);
      cols.sort((a, b) => a - b);
      for (const col of cols) {
        const value = ((card * 17 + row * 31 + col * 7) % 90) + 1;
        rows.push({ pool_card_id: cardId, value, row_no: row, col_no: col });
      }
    }
  }
  return rows;
}

function buildSyntheticRoom(
  registry: ReturnType<typeof buildRegistryFromCardNumbers>,
  ticketCount: number
): RoomRuntimeState {
  const tickets: TicketRow[] = [];
  const cellsByCard = new Map<string, CardCell[]>();

  for (const [cardId] of registry.definitions) {
    const valueToBit = registry.valueToBitByCard.get(cardId)!;
    const cells: CardCell[] = [];
    for (const [value, bit] of valueToBit) {
      const rowNo = bit < 5 ? 1 : bit < 10 ? 2 : 3;
      cells.push({ value, rowNo });
    }
    cellsByCard.set(cardId, cells);
  }

  for (let i = 0; i < ticketCount; i++) {
    const cardId = `card-${i % CARD_COUNT}`;
    tickets.push({
      id: `t-${i}`,
      room_id: "bench-room",
      player_user_id: `u-${i % 80}`,
      pool_card_id: cardId,
      price: 100,
      reservation_status: "consumed",
      cancelled_at: null,
    });
  }

  const snapshot: RoomStateSnapshot = {
    room: {
      id: "bench-room",
      status: "playing",
      currency: "IRR",
      room_seed: "bench",
      room_template_id: null,
      next_draw_at: null,
      starts_at: null,
      min_players: 1,
      countdown_sec: 120,
      first_line_draw_number: null,
      line_reward_percentage: 0.5,
      full_reward_percentage: 0.8,
      ding_per_number: 1,
      meta: null,
    },
    tickets,
    cellsByCard,
    markedByTicket: new Map(),
    existingLineTickets: new Set(),
    existingFullTickets: new Set(),
    drawnNumbers: [],
    unprocessedDrawNumbers: new Set(),
    templateDingPerNumber: null,
  };

  return new RoomRuntimeState(snapshot);
}

function benchScan(state: RoomRuntimeState, drawSequence: number[]): number {
  const t0 = performance.now();
  for (const n of drawSequence) {
    state.applyMarkForDrawScan(n);
    state.evaluateDrawScan(n);
  }
  return performance.now() - t0;
}

function benchBitmask(
  state: RoomRuntimeState,
  registry: ReturnType<typeof buildRegistryFromCardNumbers>,
  drawSequence: number[]
): number {
  state.syncMasksFromMarks(registry);
  const assignments = buildRoomAssignmentIndex(state.getTickets() as TicketRow[]);
  const maskByTicket = new Map(state.maskByTicket);

  const t0 = performance.now();
  for (const n of drawSequence) {
    const markResult = applyMarkForDrawBitmask({
      drawNumber: n,
      numberIndex: registry.numberIndex,
      assignmentsByCardId: assignments.assignmentsByCardId,
      maskByTicket,
    });
    evaluateRoomAfterDrawBitmask({
      drawNumber: n,
      firstLineDrawNumber: state.room.first_line_draw_number,
      maskByTicket,
      ticketCardId: assignments.ticketCardId,
      ticketUserId: assignments.ticketUserId,
      cardDefs: registry.definitions,
    });
  }
  return performance.now() - t0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function runMarkingBenchmark(): void {
  console.log("=== Marking Engine Benchmark ===");
  console.log(`Cards: ${CARD_COUNT}, Tickets/room: ${TICKETS_PER_ROOM}, Draws: ${DRAWS_PER_RUN}`);

  const poolRows = generateCardPool(CARD_COUNT);
  const registry = buildRegistryFromCardNumbers(poolRows);
  console.log(`Registry: ${registry.cardCount} cards, ${registry.indexEntryCount} index entries`);

  const drawSequence = Array.from({ length: DRAWS_PER_RUN }, (_, i) => (i * 7 + 11) % 90 + 1);

  for (let w = 0; w < WARMUP_RUNS; w++) {
    benchScan(buildSyntheticRoom(registry, TICKETS_PER_ROOM), drawSequence);
    benchBitmask(buildSyntheticRoom(registry, TICKETS_PER_ROOM), registry, drawSequence);
  }

  const scanTimes: number[] = [];
  const bitmaskTimes: number[] = [];

  for (let r = 0; r < BENCHMARK_RUNS; r++) {
    scanTimes.push(benchScan(buildSyntheticRoom(registry, TICKETS_PER_ROOM), drawSequence));
    bitmaskTimes.push(
      benchBitmask(buildSyntheticRoom(registry, TICKETS_PER_ROOM), registry, drawSequence)
    );
  }

  const scanMedian = median(scanTimes);
  const bitmaskMedian = median(bitmaskTimes);
  const speedup = scanMedian / bitmaskMedian;

  console.log("\n--- Results (median of", BENCHMARK_RUNS, "runs) ---");
  console.log(`Scan path:    ${scanMedian.toFixed(2)} ms (${(scanMedian / DRAWS_PER_RUN).toFixed(3)} ms/draw)`);
  console.log(`Bitmask path: ${bitmaskMedian.toFixed(2)} ms (${(bitmaskMedian / DRAWS_PER_RUN).toFixed(3)} ms/draw)`);
  console.log(`Speedup:      ${speedup.toFixed(2)}x`);
  console.log("\nPer-draw scan complexity:    O(tickets × cells)");
  console.log("Per-draw bitmask complexity: O(affected_assignments)");
}

const invokedDirectly = process.argv[1]?.includes("marking-benchmark");
if (invokedDirectly) {
  runMarkingBenchmark();
}
