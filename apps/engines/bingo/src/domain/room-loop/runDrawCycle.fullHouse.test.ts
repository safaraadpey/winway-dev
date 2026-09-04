import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickNextNumber } from "../../core/index.js";
import { buildRegistryFromCardNumbers } from "../../core/card-registry/build.js";
import type { RoomRow, TicketRow } from "../../repositories/types.js";
import { RoomRuntimeState } from "../../state/room-state.js";
import type { ClockDrawPayload } from "./clockDrawPayload.js";
import { evaluateDrawInRam } from "./evaluateDrawInRam.js";
import {
  FULL_HOUSE_FROZEN_POLL_MS,
  fullHouseFrozenWait,
  runOneDrawCycle,
} from "./runDrawCycle.js";
import type { RoomGameActor } from "../../workers/room-loop/roomGameActor.js";

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
const ROOM_SEED = Buffer.alloc(32, 0xab);

function makeRoom(overrides: Partial<RoomRow> = {}): RoomRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    status: "playing",
    currency: "IRR",
    room_seed: `\\x${ROOM_SEED.toString("hex")}`,
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
    ding_settle_mode: "room_level",
    meta: null,
    ...overrides,
  };
}

function makeState(drawnNumbers: number[] = []): RoomRuntimeState {
  const tickets: TicketRow[] = [
    {
      id: "t1",
      room_id: "00000000-0000-4000-8000-000000000001",
      player_user_id: "u1",
      pool_card_id: "c1",
      price: 100,
      reservation_status: "consumed",
      cancelled_at: null,
    },
  ];
  return new RoomRuntimeState({
    room: makeRoom(),
    tickets,
    markedByTicket: new Map(),
    existingLineTickets: new Set(),
    existingFullTickets: new Set(),
    drawnNumbers: [...drawnNumbers],
    unprocessedDrawNumbers: new Set(drawnNumbers),
    templateDingPerNumber: null,
  });
}

function findFullHouseWinScenario(): { state: RoomRuntimeState; winningBall: number } {
  const state = makeState([]);
  const drawn: number[] = [];

  for (let guard = 0; guard < 90; guard++) {
    const next = pickNextNumber(ROOM_SEED, drawn);
    if (next === null) {
      throw new Error("seed exhausted before full house");
    }

    const probe = makeState([...drawn]);
    for (const n of drawn) {
      evaluateDrawInRam(probe, n, registry);
    }
    const winCheck = evaluateDrawInRam(probe, next, registry);
    if (winCheck.fullWinnerThisDraw) {
      for (const n of drawn) {
        evaluateDrawInRam(state, n, registry);
        state.recordDrawInserted(n);
      }
      return { state, winningBall: next };
    }

    evaluateDrawInRam(state, next, registry);
    state.recordDrawInserted(next);
    drawn.push(next);
  }

  throw new Error("no full-house draw found for test seed");
}

function stubActor(
  state: RoomRuntimeState,
  hooks: {
    enqueue?: (payload: ClockDrawPayload) => void;
    countUnprocessedDraws?: () => Promise<number>;
  } = {}
): RoomGameActor {
  const enqueued: ClockDrawPayload[] = [];
  const persistQueue = {
    depth: () => enqueued.length,
    enqueue: (payload: ClockDrawPayload) => {
      enqueued.push(payload);
      hooks.enqueue?.(payload);
    },
  };

  return {
    roomId: state.roomId,
    room: state.room,
    ramNextDrawAtIso: new Date(Date.now() - 1000).toISOString(),
    cardRegistry: registry,
    persistQueue,
    repo: {
      countUnprocessedDraws: hooks.countUnprocessedDraws ?? (async () => 0),
    },
    supabase: {},
    log: { info: () => {}, warn: () => {}, error: () => {} },
    stateManager: {
      ensureLoaded: async () => state,
    },
    config: { roomLoopMaxUnprocessedDraws: 2 },
    metrics: { noteBackpressure: () => {} },
    get enqueued() {
      return enqueued;
    },
  } as unknown as RoomGameActor;
}

describe("fullHouseFrozenWait", () => {
  it("returns idle (not exhausted) with stable poll interval", () => {
    const result = fullHouseFrozenWait();
    assert.equal(result.kind, "idle");
    if (result.kind === "idle") {
      assert.equal(result.retryMs, FULL_HOUSE_FROZEN_POLL_MS);
    }
  });
});

describe("runOneDrawCycle full-house lifecycle", () => {
  it("returns frozen idle when RAM is already full-house frozen", async () => {
    const state = makeState();
    state.freezeAfterFullHouse();
    const actor = stubActor(state);

    const result = await runOneDrawCycle(actor);

    assert.deepEqual(result, fullHouseFrozenWait());
    assert.equal((actor as unknown as { enqueued: ClockDrawPayload[] }).enqueued.length, 0);
  });

  it("enqueues winning payload once and returns frozen idle (not exhausted)", async () => {
    const { state, winningBall } = findFullHouseWinScenario();
    const actor = stubActor(state);

    const result = await runOneDrawCycle(actor);
    const payloads = (actor as unknown as { enqueued: ClockDrawPayload[] }).enqueued;

    assert.deepEqual(result, fullHouseFrozenWait());
    assert.equal(state.isFullHouseFrozen(), true);
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0]!.number, winningBall);
    assert.equal(payloads[0]!.fullWinnerThisDraw, true);
  });

  it("does not pick or enqueue while waiting for winning persist", async () => {
    const { state } = findFullHouseWinScenario();
    const actor = stubActor(state);

    await runOneDrawCycle(actor);
    const firstEnqueue =
      (actor as unknown as { enqueued: ClockDrawPayload[] }).enqueued.length;

    const frozen = await runOneDrawCycle(actor);
    const frozenAgain = await runOneDrawCycle(actor);

    assert.deepEqual(frozen, fullHouseFrozenWait());
    assert.deepEqual(frozenAgain, fullHouseFrozenWait());
    assert.equal(
      (actor as unknown as { enqueued: ClockDrawPayload[] }).enqueued.length,
      firstEnqueue
    );
  });

  it("does not accumulate Ding while frozen after full house", async () => {
    const { state } = findFullHouseWinScenario();
    state.replaceRoomDingPending(new Map([["u1", 5]]));
    const actor = stubActor(state);

    await runOneDrawCycle(actor);
    const dingAfterWin = state.getPendingDingForUser("u1");

    await runOneDrawCycle(actor);

    assert.equal(state.getPendingDingForUser("u1"), dingAfterWin);
  });
});
