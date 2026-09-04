import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accumulateDrawDingCredits,
  buildRoomFinalizationDingPayload,
  rebuildRoomDingPendingFromProcessedMarks,
  replayRoomDingFromMarks,
  roomDingSettlementKey,
} from "./roomDingState.js";
import { RoomRuntimeState } from "../../state/room-state.js";
import type { RoomRow, TicketRow } from "../../repositories/types.js";

function makeRoom(overrides: Partial<RoomRow> = {}): RoomRow {
  return {
    id: "room-1",
    status: "playing",
    currency: "IRR",
    room_seed: null,
    room_template_id: null,
    next_draw_at: null,
    starts_at: null,
    waiting_started_at: null,
    min_players: 2,
    max_players: 10,
    countdown_sec: 120,
    first_line_draw_number: null,
    line_reward_percentage: null,
    full_reward_percentage: null,
    ding_per_number: 2,
    ding_settle_mode: "room_level",
    meta: null,
    ...overrides,
  };
}

function makeState(tickets: TicketRow[]): RoomRuntimeState {
  return new RoomRuntimeState({
    room: makeRoom(),
    tickets,
    markedByTicket: new Map(),
    existingLineTickets: new Set(),
    existingFullTickets: new Set(),
    drawnNumbers: [],
    unprocessedDrawNumbers: new Set(),
    templateDingPerNumber: null,
  });
}

describe("roomDingState", () => {
  it("accumulates credits across draws", () => {
    const pending = new Map<string, number>();
    accumulateDrawDingCredits(pending, [{ user_id: "u1", amount: 4 }]);
    accumulateDrawDingCredits(pending, [{ user_id: "u1", amount: 6 }]);
    assert.equal(pending.get("u1"), 10);
  });

  it("builds stable settlement key and payload", () => {
    const pending = new Map([["u1", 10], ["u2", 4]]);
    const payload = buildRoomFinalizationDingPayload("room-1", pending);
    assert.equal(payload.settlementKey, roomDingSettlementKey("room-1"));
    assert.equal(payload.dingCredits.length, 2);
    assert.equal(payload.dingCredits[0]!.userId, "u1");
  });

  it("replay from marks matches live reserved-only rule", () => {
    const state = makeState([
      {
        id: "t1",
        room_id: "room-1",
        player_user_id: "u1",
        pool_card_id: "c1",
        price: 100,
        reservation_status: "reserved",
        cancelled_at: null,
      },
      {
        id: "t2",
        room_id: "room-1",
        player_user_id: "u2",
        pool_card_id: "c2",
        price: 100,
        reservation_status: "consumed",
        cancelled_at: null,
      },
    ]);
    const marksByDraw = new Map<number, { ticket_id: string; value: number }[]>([
      [7, [
        { ticket_id: "t1", value: 7 },
        { ticket_id: "t2", value: 7 },
      ]],
    ]);
    const pending = replayRoomDingFromMarks({
      state,
      processedDrawNumbers: [7],
      marksByDraw,
    });
    assert.equal(pending.get("u1"), 2);
    assert.equal(pending.has("u2"), false);
  });

  it("rebuilds Ding from processed marks and ignores unprocessed ghost draws", () => {
    const state = makeState([
      {
        id: "t1",
        room_id: "room-1",
        player_user_id: "u1",
        pool_card_id: "c1",
        price: 100,
        reservation_status: "reserved",
        cancelled_at: null,
      },
    ]);
    state.recordDrawInserted(7);
    state.recordDrawProcessed(7);
    state.markedByTicket.set("t1", new Set([7, 9]));
    state.recordDrawInserted(9);
    state.accumulateRoomDing([{ user_id: "u1", amount: 99 }]);

    rebuildRoomDingPendingFromProcessedMarks(state);
    assert.equal(state.getPendingDingForUser("u1"), 2);
    assert.equal(state.getProcessedDrawNumbers().includes(9), false);
  });

  it("RoomRuntimeState accumulates only for room_level", () => {
    const state = makeState([]);
    state.accumulateRoomDing([{ user_id: "u1", amount: 3 }]);
    assert.equal(state.getPendingDingForUser("u1"), 3);

    const perDraw = makeState([]);
    perDraw.room = makeRoom({ ding_settle_mode: "per_draw" });
    perDraw.accumulateRoomDing([{ user_id: "u1", amount: 99 }]);
    assert.equal(perDraw.getPendingDingForUser("u1"), 0);
  });
});
