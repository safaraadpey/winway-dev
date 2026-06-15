import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isActorOwnedLiveRoom,
  partitionActorOwnedJobs,
} from "./filterActorOwnedDrawJobs.js";
import type { DrawJob } from "./types.js";

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

describe("isActorOwnedLiveRoom", () => {
  it("treats playing rooms as actor-owned", () => {
    assert.equal(isActorOwnedLiveRoom({ status: "playing" }), true);
  });

  it("does not treat finished or waiting rooms as actor-owned", () => {
    assert.equal(isActorOwnedLiveRoom({ status: "finished" }), false);
    assert.equal(isActorOwnedLiveRoom({ status: "waiting" }), false);
    assert.equal(isActorOwnedLiveRoom(null), false);
  });
});

describe("partitionActorOwnedJobs", () => {
  it("passes non-playing room jobs through unchanged", () => {
    const roomById = new Map([["r1", { status: "finished" as const }]]);
    const result = partitionActorOwnedJobs(
      [job(1, "r1", 5)],
      roomById,
      new Map()
    );
    assert.equal(result.toProcess.length, 1);
    assert.equal(result.markDone.length, 0);
    assert.equal(result.requeue.length, 0);
  });

  it("marks playing-room jobs done when draw already processed", () => {
    const roomById = new Map([["r1", { status: "playing" as const }]]);
    const processed = new Map([["r1", new Set([7])]]);
    const result = partitionActorOwnedJobs(
      [job(2, "r1", 7)],
      roomById,
      processed
    );
    assert.equal(result.markDone.length, 1);
    assert.equal(result.requeue.length, 0);
    assert.equal(result.toProcess.length, 0);
  });

  it("requeues playing-room jobs when draw not yet processed", () => {
    const roomById = new Map([["r1", { status: "playing" as const }]]);
    const result = partitionActorOwnedJobs(
      [job(3, "r1", 9)],
      roomById,
      new Map([["r1", new Set()]])
    );
    assert.equal(result.requeue.length, 1);
    assert.equal(result.toProcess.length, 0);
  });

  it("skips all playing-room jobs from main processor path", () => {
    const roomById = new Map([
      ["playing", { status: "playing" as const }],
      ["done", { status: "finished" as const }],
    ]);
    const result = partitionActorOwnedJobs(
      [job(4, "playing", 1), job(5, "done", 2)],
      roomById,
      new Map()
    );
    assert.deepEqual(
      result.toProcess.map((j) => j.room_id),
      ["done"]
    );
    assert.equal(result.requeue.length, 1);
  });
});
