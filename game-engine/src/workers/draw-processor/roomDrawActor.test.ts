import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DrawJobPickContext } from "../../domain/draw/drawJobPickContext.js";
import type { DrawJob } from "../../domain/draw/types.js";
import { RoomDrawActor } from "./roomDrawActor.js";

const pickContext: DrawJobPickContext = {
  firstPickedAt: "2026-01-01T00:00:00.000Z",
  pickStartTime: "2026-01-01T00:00:00.000Z",
  pickEndTime: "2026-01-01T00:00:00.000Z",
  pickMsPerJob: 1,
  drainStartedAt: null,
};

function job(id: number, drawNumber: number): DrawJob {
  return {
    id,
    room_id: "room-a",
    draw_number: drawNumber,
    status: "processing",
    attempts: 0,
    created_at: `2026-01-01T00:00:0${id}.000Z`,
    updated_at: `2026-01-01T00:00:0${id}.000Z`,
  };
}

describe("RoomDrawActor", () => {
  it("processes jobs serially in draw_number order", async () => {
    const order: number[] = [];
    let resolveGate!: () => void;
    const gate = new Promise<void>((r) => {
      resolveGate = r;
    });

    const actor = new RoomDrawActor("room-a", {
      supabase: {} as never,
      log: { info: () => {}, warn: () => {}, error: () => {} },
      repo: {} as never,
      stateManager: {} as never,
      maxAttempts: 3,
      getCardRegistry: () => null,
      redis: null,
      drawRoomLockTtlSec: 0,
      onOutcome: () => {},
    });

    const original = actor["runOne"].bind(actor);
    actor["runOne"] = async (work) => {
      order.push(work.job.draw_number);
      if (work.job.draw_number === 1) {
        await gate;
      }
      return "done";
    };

    actor.enqueue(job(2, 3), pickContext);
    actor.enqueue(job(1, 1), pickContext);
    actor.enqueue(job(3, 2), pickContext);

    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(order, [1]);

    resolveGate();
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(order, [1, 2, 3]);
    assert.equal(actor.isIdle(), true);

    void original;
  });
});
