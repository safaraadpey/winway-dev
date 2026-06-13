import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { partitionActorOwnedJobs } from "./filterActorOwnedDrawJobs.js";
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

describe("partitionActorOwnedJobs", () => {
  it("passes queue-room jobs through unchanged", () => {
    const roomById = new Map([["r1", { meta: null }]]);
    const result = partitionActorOwnedJobs(
      [job(1, "r1", 5)],
      roomById,
      "scheduler_queue",
      new Map()
    );
    assert.equal(result.toProcess.length, 1);
    assert.equal(result.markDone.length, 0);
    assert.equal(result.requeue.length, 0);
  });

  it("marks actor-room jobs done when draw already processed", () => {
    const roomById = new Map([["r1", { meta: { loop_mode: "actor" } }]]);
    const processed = new Map([["r1", new Set([7])]]);
    const result = partitionActorOwnedJobs(
      [job(2, "r1", 7)],
      roomById,
      "scheduler_queue",
      processed
    );
    assert.equal(result.markDone.length, 1);
    assert.equal(result.requeue.length, 0);
    assert.equal(result.toProcess.length, 0);
  });

  it("requeues actor-room jobs when draw not yet processed", () => {
    const roomById = new Map([["r1", { meta: null }]]);
    const result = partitionActorOwnedJobs(
      [job(3, "r1", 9)],
      roomById,
      "actor",
      new Map([["r1", new Set()]])
    );
    assert.equal(result.requeue.length, 1);
    assert.equal(result.toProcess.length, 0);
  });

  it("respects per-room opt-out under global actor mode", () => {
    const roomById = new Map([
      ["actor", { meta: null }],
      ["legacy", { meta: { loop_mode: "scheduler_queue" } }],
    ]);
    const result = partitionActorOwnedJobs(
      [job(4, "actor", 1), job(5, "legacy", 2)],
      roomById,
      "actor",
      new Map()
    );
    assert.deepEqual(
      result.toProcess.map((j) => j.room_id),
      ["legacy"]
    );
    assert.equal(result.requeue.length, 1);
  });
});
