import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RoomRow, TicketRow } from "../repositories/types.js";
import { RoomRuntimeState } from "./room-state.js";

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
  const cellsByCard = new Map([
    [
      "c1",
      [
        { value: 7, rowNo: 1 },
        { value: 14, rowNo: 1 },
        { value: 21, rowNo: 2 },
      ],
    ],
  ]);
  return new RoomRuntimeState({
    room,
    tickets,
    cellsByCard,
    markedByTicket: new Map(),
    existingLineTickets: new Set(),
    existingFullTickets: new Set(),
    drawnNumbers: [],
    unprocessedDrawNumbers: new Set(),
    templateDingPerNumber: null,
  });
}

describe("RoomRuntimeState", () => {
  it("applyMarkForDraw updates memory marks", () => {
    const state = makeState();
    const rows = state.applyMarkForDraw(7);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.ticket_id, "t1");
    assert.ok(state.getMarks().get("t1")?.has(7));
  });

  it("recordDrawInserted tracks backpressure", () => {
    const state = makeState();
    assert.equal(state.hasUnprocessedDraw(), false);
    state.recordDrawInserted(7);
    assert.equal(state.hasUnprocessedDraw(), true);
    state.recordDrawProcessed(7);
    assert.equal(state.hasUnprocessedDraw(), false);
  });

  it("isBroken when tickets exist but cells are empty", () => {
    const room = {
      id: "room-1",
      status: "playing" as const,
      currency: "IRR",
      room_seed: null,
      room_template_id: null,
      next_draw_at: null,
      starts_at: null,
      min_players: 1,
      countdown_sec: 120,
      first_line_draw_number: null,
      line_reward_percentage: null,
      full_reward_percentage: null,
      ding_per_number: null,
      meta: null,
    };
    const state = new RoomRuntimeState({
      room,
      tickets: [
        {
          id: "t1",
          room_id: "room-1",
          player_user_id: "u1",
          pool_card_id: "c1",
          price: 100,
          reservation_status: "consumed",
          cancelled_at: null,
        },
      ],
      cellsByCard: new Map(),
      markedByTicket: new Map(),
      existingLineTickets: new Set(),
      existingFullTickets: new Set(),
      drawnNumbers: [],
      unprocessedDrawNumbers: new Set(),
      templateDingPerNumber: null,
    });
    assert.equal(RoomRuntimeState.isBroken(state), true);
  });

  it("countDingMatchedByUser counts only reserved tickets", () => {
    const room = {
      id: "room-1",
      status: "playing" as const,
      currency: "IRR",
      room_seed: null,
      room_template_id: null,
      next_draw_at: null,
      starts_at: null,
      min_players: 1,
      countdown_sec: 120,
      first_line_draw_number: null,
      line_reward_percentage: null,
      full_reward_percentage: null,
      ding_per_number: null,
      meta: null,
    };
    const state = new RoomRuntimeState({
      room,
      tickets: [
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
      ],
      cellsByCard: new Map(),
      markedByTicket: new Map(),
      existingLineTickets: new Set(),
      existingFullTickets: new Set(),
      drawnNumbers: [],
      unprocessedDrawNumbers: new Set(),
      templateDingPerNumber: null,
    });
    const matched = state.countDingMatchedByUser(
      [
        { ticket_id: "t1", value: 7 },
        { ticket_id: "t2", value: 7 },
      ],
      7
    );
    assert.equal(matched.get("u1"), 1);
    assert.equal(matched.has("u2"), false);
  });

  it("mergeMarksFromDb unions marks into memory", () => {
    const state = makeState();
    const dbMarks = new Map([["t1", new Set([7, 14])]]);
    state.mergeMarksFromDb(dbMarks);
    assert.equal(state.marksReadCount(), 2);
  });

  it("syncDrawSchedulerState replaces drawn and unprocessed from DB", () => {
    const state = makeState();
    state.recordDrawInserted(7);
    state.syncDrawSchedulerState([1, 2, 3], [2]);
    assert.deepEqual([...state.getDrawnNumbers()], [1, 2, 3]);
    assert.equal(state.hasUnprocessedDraw(), true);
    state.syncDrawSchedulerState([1, 2, 3], []);
    assert.equal(state.hasUnprocessedDraw(), false);
  });

  it("applyMarkForDraw is idempotent in memory", () => {
    const state = makeState();
    state.applyMarkForDraw(7);
    const rows = state.applyMarkForDraw(7);
    assert.equal(rows.length, 1);
    assert.equal(state.getMarks().get("t1")!.size, 1);
  });

  it("needsReconcile after load and on checkpoint boundary", () => {
    const state = makeState();
    assert.equal(state.needsReconcile(10), false);

    state.markLoadedFromDb();
    assert.equal(state.needsReconcile(10), true);
    state.noteReconcileDone();
    assert.equal(state.needsReconcile(10), false);

    for (let i = 0; i < 10; i++) state.recordDrawProcessed(i + 1);
    assert.equal(state.needsReconcile(10), true);
  });

  it("requestReconcile forces next evaluate sync", () => {
    const state = makeState();
    state.requestReconcile();
    assert.equal(state.needsReconcile(0), true);
  });

  it("tracks lastProcessedDrawNumber and detects out-of-order draws", () => {
    const state = makeState();
    state.recordDrawProcessed(55);
    assert.equal(state.lastProcessedDrawNumber, 55);
    assert.equal(state.isOutOfOrderDraw(8), true);
    assert.equal(state.isOutOfOrderDraw(60), false);
    assert.equal(state.needsReconcile(10, 8), true);
  });

  it("replaceExistingResultsFromDb replaces winner sets from DB", () => {
    const state = makeState();
    state.existingLineTickets.add("stale");
    state.replaceExistingResultsFromDb([
      {
        ticket_id: "t1",
        user_id: "u1",
        win_type: "line",
        draw_number: 55,
      },
    ]);
    assert.deepEqual([...state.existingLineTickets], ["t1"]);
    assert.equal(state.room.first_line_draw_number, 55);
  });
});
