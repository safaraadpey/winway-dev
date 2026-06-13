import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isActorRoom, roomLoopModeFor } from "./loopMode.js";

describe("loopMode gating", () => {
  it("per-room meta.loop_mode overrides the global default", () => {
    assert.equal(roomLoopModeFor({ meta: { loop_mode: "actor" } }, "scheduler_queue"), "actor");
    assert.equal(roomLoopModeFor({ meta: { loop_mode: "scheduler_queue" } }, "actor"), "scheduler_queue");
  });

  it("falls back to global default when meta is absent/irrelevant", () => {
    assert.equal(roomLoopModeFor({ meta: null }, "scheduler_queue"), "scheduler_queue");
    assert.equal(roomLoopModeFor({ meta: {} }, "actor"), "actor");
    assert.equal(roomLoopModeFor({ meta: { other: 1 } }, "scheduler_queue"), "scheduler_queue");
  });

  it("isActorRoom: only opted-in rooms take the actor path under default scheduler_queue", () => {
    assert.equal(isActorRoom({ meta: { loop_mode: "actor" } }, "scheduler_queue"), true);
    assert.equal(isActorRoom({ meta: null }, "scheduler_queue"), false);
    // Global actor flips everything not explicitly opted out.
    assert.equal(isActorRoom({ meta: null }, "actor"), true);
    assert.equal(isActorRoom({ meta: { loop_mode: "scheduler_queue" } }, "actor"), false);
  });
});
