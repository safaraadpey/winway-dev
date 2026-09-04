import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { processDingApplyJob, type DingApplyJob } from "./processDingApplyJob.js";
import { createLogger } from "../../metrics/logger.js";
import type { GameRepo } from "../../repositories/index.js";

function makeJob(overrides: Partial<DingApplyJob> = {}): DingApplyJob {
  return {
    id: 1,
    draw_id: "draw-1",
    room_id: "room-1",
    draw_number: 5,
    ding_per_card: 2,
    credits: [{ user_id: "u1", amount: 4, matched_cards: 2 }],
    status: "processing",
    attempts: 0,
    created_at: new Date(Date.now() - 1000).toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("processDingApplyJob", () => {
  it("applies credits and completes job on success (T3 worker path)", async () => {
    const apply = mock.fn(async () => 1);
    const complete = mock.fn(async () => undefined);
    const repo = {
      applyDingCreditsForDraw: apply,
      completeDingApplyJob: complete,
    } as unknown as GameRepo;
    const log = createLogger("error");

    const outcome = await processDingApplyJob(repo, log, makeJob(), {
      maxAttempts: 10,
    });

    assert.equal(outcome, "done");
    assert.equal(apply.mock.callCount(), 1);
    assert.equal(complete.mock.callCount(), 1);
    assert.equal(complete.mock.calls[0]?.arguments[0]?.success, true);
  });

  it("requeues on apply failure until max attempts (T3/T4 safety)", async () => {
    const apply = mock.fn(async () => {
      throw new Error("apply failed");
    });
    const complete = mock.fn(async () => undefined);
    const repo = {
      applyDingCreditsForDraw: apply,
      completeDingApplyJob: complete,
    } as unknown as GameRepo;
    const log = createLogger("error");

    const outcome = await processDingApplyJob(
      repo,
      log,
      makeJob({ attempts: 8 }),
      { maxAttempts: 10 }
    );

    assert.equal(outcome, "requeue");
    assert.equal(complete.mock.calls[0]?.arguments[0]?.success, false);
  });

  it("dead-letters when attempts exhausted", async () => {
    const apply = mock.fn(async () => {
      throw new Error("apply failed");
    });
    const complete = mock.fn(async () => undefined);
    const repo = {
      applyDingCreditsForDraw: apply,
      completeDingApplyJob: complete,
    } as unknown as GameRepo;
    const log = createLogger("error");

    const outcome = await processDingApplyJob(
      repo,
      log,
      makeJob({ attempts: 9 }),
      { maxAttempts: 10 }
    );

    assert.equal(outcome, "failed");
  });
});
