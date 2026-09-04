import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isActorOwnedLiveRoom,
  partitionActorOwnedJobs,
  type RoomFilterSnapshot,
} from "./filterActorOwnedDrawJobs.js";
import { canCallerFinalizeDraw } from "./finalizeOwnership.js";
import type { DrawJob } from "./types.js";

const NOW = Date.parse("2026-06-13T12:00:00.000Z");
const FUTURE = "2026-06-13T12:05:00.000Z";
const PAST = "2026-06-13T11:55:00.000Z";

function job(id: number, roomId: string, drawNumber: number): DrawJob {
  return {
    id,
    room_id: roomId,
    draw_number: drawNumber,
    status: "processing",
    attempts: 0,
    created_at: "2026-06-13T12:00:00.000Z",
    updated_at: "2026-06-13T12:00:00.000Z",
  };
}

function livePlayingRoom(
  overrides: Partial<RoomFilterSnapshot> = {}
): RoomFilterSnapshot {
  return {
    status: "playing",
    engine_owner_id: "engine-a",
    engine_lease_until: FUTURE,
    engine_lease_epoch: 1,
    ...overrides,
  };
}

describe("isActorOwnedLiveRoom", () => {
  it("treats playing rooms with active lease as actor-owned", () => {
    assert.equal(isActorOwnedLiveRoom(livePlayingRoom(), NOW), true);
  });

  it("does not treat playing without lease as actor-owned", () => {
    assert.equal(
      isActorOwnedLiveRoom(
        livePlayingRoom({ engine_lease_until: PAST }),
        NOW
      ),
      false
    );
    assert.equal(
      isActorOwnedLiveRoom(livePlayingRoom({ engine_owner_id: null }), NOW),
      false
    );
  });

  it("does not treat finished or waiting rooms as actor-owned", () => {
    assert.equal(
      isActorOwnedLiveRoom(livePlayingRoom({ status: "finished" }), NOW),
      false
    );
    assert.equal(
      isActorOwnedLiveRoom({ status: "waiting" } as RoomFilterSnapshot, NOW),
      false
    );
    assert.equal(isActorOwnedLiveRoom(null, NOW), false);
  });
});

describe("partitionActorOwnedJobs", () => {
  it("passes non-live-owned room jobs through (expired lease playing)", () => {
    const roomById = new Map([
      [
        "r1",
        livePlayingRoom({ engine_lease_until: PAST }),
      ],
    ]);
    const result = partitionActorOwnedJobs(
      [job(1, "r1", 5)],
      roomById,
      new Map(),
      NOW
    );
    assert.equal(result.toProcess.length, 1);
    assert.equal(result.markDone.length, 0);
    assert.equal(result.requeue.length, 0);
  });

  it("passes finished room jobs through unchanged", () => {
    const roomById = new Map([["r1", { status: "finished" as const }]]);
    const result = partitionActorOwnedJobs(
      [job(1, "r1", 5)],
      roomById,
      new Map(),
      NOW
    );
    assert.equal(result.toProcess.length, 1);
  });

  it("marks live-owned jobs done when draw already processed", () => {
    const roomById = new Map([["r1", livePlayingRoom()]]);
    const processed = new Map([["r1", new Set([7])]]);
    const result = partitionActorOwnedJobs(
      [job(2, "r1", 7)],
      roomById,
      processed,
      NOW
    );
    assert.equal(result.markDone.length, 1);
    assert.equal(result.requeue.length, 0);
    assert.equal(result.toProcess.length, 0);
  });

  it("requeues live-owned jobs when draw not yet processed", () => {
    const roomById = new Map([["r1", livePlayingRoom()]]);
    const result = partitionActorOwnedJobs(
      [job(3, "r1", 9)],
      roomById,
      new Map([["r1", new Set()]]),
      NOW
    );
    assert.equal(result.requeue.length, 1);
    assert.equal(result.toProcess.length, 0);
  });

  it("draw-processor cannot finalize actively leased room (toProcess empty)", () => {
    const roomById = new Map([
      ["live", livePlayingRoom()],
      ["done", { status: "finished" as const }],
    ]);
    const result = partitionActorOwnedJobs(
      [job(4, "live", 1), job(5, "done", 2)],
      roomById,
      new Map(),
      NOW
    );
    assert.deepEqual(
      result.toProcess.map((j) => j.room_id),
      ["done"]
    );
    assert.equal(result.requeue.length, 1);
    assert.equal(
      canCallerFinalizeDraw(roomById.get("live")!, null, NOW),
      false
    );
  });

  it("missing room row goes to processor (RPC unowned path)", () => {
    const roomById = new Map<string, RoomFilterSnapshot | null>([["r1", null]]);
    const result = partitionActorOwnedJobs(
      [job(6, "r1", 1)],
      roomById,
      new Map(),
      NOW
    );
    assert.equal(result.toProcess.length, 1);
  });
});
