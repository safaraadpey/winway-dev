import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isManifestRamMode } from "../../repositories/types.js";
import type { RoomRow } from "../../repositories/types.js";
import { runOneDrawCycle } from "./runDrawCycle.js";
import type { RoomGameActor } from "../../workers/room-loop/roomGameActor.js";
import { RoomRuntimeState } from "../../state/room-state.js";
import type { TicketRow } from "../../repositories/types.js";

function makeManifestRamRoom(): RoomRow {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    status: "playing",
    currency: "IRR",
    room_seed: "\\x" + "ab".repeat(32),
    room_template_id: null,
    next_draw_at: null,
    starts_at: null,
    waiting_started_at: null,
    min_players: 1,
    max_players: null,
    countdown_sec: 120,
    first_line_draw_number: null,
    line_reward_percentage: null,
    full_reward_percentage: null,
    ding_per_number: null,
    ding_settle_mode: "room_level",
    gameplay_persist_mode: "manifest_ram",
    meta: null,
  };
}

describe("manifest_ram runOneDrawCycle", () => {
  it("does not enqueue persist queue (writes-per-draw=0)", async () => {
    const enqueued: unknown[] = [];
    const room = makeManifestRamRoom();
    const tickets: TicketRow[] = [
      {
        id: "t1",
        room_id: room.id,
        player_user_id: "u1",
        pool_card_id: "c1",
        price: 100,
        reservation_status: "consumed",
        cancelled_at: null,
      },
    ];
    const state = new RoomRuntimeState({
      room,
      tickets,
      markedByTicket: new Map(),
      existingLineTickets: new Set(),
      existingFullTickets: new Set(),
      drawnNumbers: [],
      unprocessedDrawNumbers: new Set(),
      templateDingPerNumber: null,
    });

    const actor = {
      roomId: room.id,
      room,
      ramNextDrawAtIso: new Date(Date.now() - 1000).toISOString(),
      cardRegistry: null,
      persistQueue: {
        depth: () => enqueued.length,
        enqueue: (p: unknown) => enqueued.push(p),
      },
      repo: { countUnprocessedDraws: async () => 0 },
      supabase: {},
      log: { info: () => {}, warn: () => {}, error: () => {} },
      stateManager: { ensureLoaded: async () => state },
      config: { roomLoopMaxUnprocessedDraws: 2 },
      metrics: { noteBackpressure: () => {} },
    } as unknown as RoomGameActor;

    const result = await runOneDrawCycle(actor);
    assert.equal(enqueued.length, 0);
    assert.ok(result.kind === "idle" || result.kind === "drew");
  });

  it("isManifestRamMode identifies manifest_ram rooms", () => {
    assert.equal(isManifestRamMode("manifest_ram"), true);
    assert.equal(isManifestRamMode("per_draw"), false);
    assert.equal(isManifestRamMode(null), false);
  });
});
