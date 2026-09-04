import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRAW_FINALIZE_LOG,
  drawFinalizeMeta,
  elapsedFinalizeMs,
  logDrawFinalize,
  nowFinalizeMs,
  roundFinalizeMs,
} from "./drawFinalizeObservability.js";

describe("drawFinalizeObservability", () => {
  it("includes roomId / drawNumber / jobId correlation and null intra-RPC splits", () => {
    const meta = drawFinalizeMeta({
      owner: "ram-clock-persist",
      roomId: "room-1",
      drawNumber: 12,
      jobId: 99,
      outcome: "done",
      queueWaitMs: 15,
      insertRpcMs: 8.2,
      finalizeRpcMs: 42.5,
      markCount: 3,
      resultCount: 1,
      dingCreditCount: 2,
      dingUsersCredited: 2,
    });

    assert.equal(meta.owner, "ram-clock-persist");
    assert.equal(meta.roomId, "room-1");
    assert.equal(meta.drawNumber, 12);
    assert.equal(meta.jobId, 99);
    assert.equal(meta.outcome, "done");
    assert.equal(meta.queueWaitMs, 15);
    assert.equal(meta.insertRpcMs, 8.2);
    assert.equal(meta.finalizeRpcMs, 42.5);
    assert.equal(meta.markCount, 3);
    assert.equal(meta.resultCount, 1);
    assert.equal(meta.dingCreditCount, 2);
    assert.equal(meta.lockWaitMs, null);
    assert.equal(meta.marksResultsMs, null);
    assert.equal(meta.triggerDingMs, null);
    assert.equal(meta.alreadyProcessed, false);
  });

  it("marks duplicate finalize attempts", () => {
    const meta = drawFinalizeMeta({
      owner: "draw-processor",
      roomId: "room-2",
      drawNumber: 4,
      jobId: 7,
      outcome: "duplicate",
      alreadyProcessed: true,
    });
    assert.equal(meta.outcome, "duplicate");
    assert.equal(meta.alreadyProcessed, true);
  });

  it("round-trips timer helpers", () => {
    assert.equal(roundFinalizeMs(12.345), 12.35);
    const t0 = nowFinalizeMs();
    const elapsed = elapsedFinalizeMs(t0);
    assert.ok(elapsed >= 0);
  });

  it("logs duplicate and fenced as warn with stable prefix", () => {
    const lines: { level: string; message: string; meta?: Record<string, unknown> }[] =
      [];
    const log = {
      info: (message: string, meta?: Record<string, unknown>) =>
        lines.push({ level: "info", message, meta }),
      warn: (message: string, meta?: Record<string, unknown>) =>
        lines.push({ level: "warn", message, meta }),
      error: (message: string, meta?: Record<string, unknown>) =>
        lines.push({ level: "error", message, meta }),
    };

    logDrawFinalize(log, {
      owner: "recovery",
      roomId: "r",
      drawNumber: 1,
      jobId: 2,
      outcome: "duplicate",
      alreadyProcessed: true,
    });
    logDrawFinalize(log, {
      owner: "ram-clock-persist",
      roomId: "r",
      drawNumber: 1,
      jobId: 2,
      outcome: "done",
      finalizeRpcMs: 10,
    });

    assert.equal(lines[0]?.level, "warn");
    assert.equal(lines[0]?.message, DRAW_FINALIZE_LOG);
    assert.equal(lines[0]?.meta?.outcome, "duplicate");
    assert.equal(lines[1]?.level, "info");
    assert.equal(lines[1]?.message, DRAW_FINALIZE_LOG);
    assert.equal(lines[1]?.meta?.jobId, 2);
  });
});
