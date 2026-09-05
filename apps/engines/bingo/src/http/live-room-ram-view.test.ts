import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRegistryFromCardNumbers } from "../core/card-registry/build.js";
import type { RoomRow, TicketRow } from "../repositories/types.js";
import { RoomRuntimeState } from "../state/room-state.js";
import { evaluateDrawInRam } from "../domain/room-loop/evaluateDrawInRam.js";
import { buildRamLiveWinners } from "./live-room-ram-view.js";

const CARD_CELLS = [
  { pool_card_id: "c1", value: 7, row_no: 1, col_no: 1 },
  { pool_card_id: "c1", value: 10, row_no: 1, col_no: 3 },
  { pool_card_id: "c1", value: 19, row_no: 1, col_no: 5 },
  { pool_card_id: "c1", value: 28, row_no: 1, col_no: 7 },
  { pool_card_id: "c1", value: 37, row_no: 1, col_no: 9 },
  { pool_card_id: "c1", value: 14, row_no: 2, col_no: 2 },
  { pool_card_id: "c1", value: 11, row_no: 2, col_no: 4 },
  { pool_card_id: "c1", value: 20, row_no: 2, col_no: 6 },
  { pool_card_id: "c1", value: 29, row_no: 2, col_no: 8 },
  { pool_card_id: "c1", value: 38, row_no: 2, col_no: 9 },
  { pool_card_id: "c1", value: 21, row_no: 3, col_no: 1 },
  { pool_card_id: "c1", value: 12, row_no: 3, col_no: 3 },
  { pool_card_id: "c1", value: 30, row_no: 3, col_no: 5 },
  { pool_card_id: "c1", value: 39, row_no: 3, col_no: 7 },
  { pool_card_id: "c1", value: 40, row_no: 3, col_no: 9 },
];

const registry = buildRegistryFromCardNumbers(CARD_CELLS);

function makeState(): RoomRuntimeState {
  const room: RoomRow = {
    id: "room-1",
    status: "playing",
    currency: "IRR",
    room_seed: null,
    room_template_id: null,
    next_draw_at: null,
    starts_at: null,
    min_players: 1,
    max_players: null,
    countdown_sec: 120,
    first_line_draw_number: null,
    line_reward_percentage: null,
    full_reward_percentage: null,
    ding_per_number: null,
    meta: null,
  };
  const tickets: TicketRow[] = [
    {
      id: "t1",
      room_id: "room-1",
      player_user_id: "u1",
      pool_card_id: "c1",
      price: 100,
      reservation_status: "consumed",
      cancelled_at: null,
    },
  ];
  return new RoomRuntimeState({
    room,
    tickets,
    markedByTicket: new Map(),
    existingLineTickets: new Set(),
    existingFullTickets: new Set(),
    drawnNumbers: [],
    unprocessedDrawNumbers: new Set(),
    templateDingPerNumber: null,
  });
}

describe("buildRamLiveWinners", () => {
  it("is empty before any line win", () => {
    const state = makeState();
    evaluateDrawInRam(state, 7, registry);
    const winners = buildRamLiveWinners(state);
    assert.deepEqual(winners.line_winners, []);
    assert.deepEqual(winners.full_winners, []);
  });

  it("exposes first line winner from RAM after the completing ball", () => {
    const state = makeState();
    for (const n of [7, 10, 19, 28, 37]) {
      evaluateDrawInRam(state, n, registry);
    }
    const winners = buildRamLiveWinners(state);
    assert.deepEqual(winners.line_winners, [
      { ticketId: "t1", userId: "u1", drawNumber: 37 },
    ]);
    assert.equal(winners.full_winners.length, 0);
  });
});
