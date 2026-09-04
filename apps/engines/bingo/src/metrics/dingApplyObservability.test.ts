import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dingApplyMeta,
  elapsedDingApplyMs,
  logDingApply,
  nowDingApplyMs,
} from "./dingApplyObservability.js";
import { createLogger } from "./logger.js";

describe("dingApplyObservability", () => {
  it("builds stable meta payload", () => {
    const meta = dingApplyMeta({
      jobId: 42,
      roomId: "room-1",
      drawNumber: 7,
      outcome: "done",
      queueLagMs: 1200,
      applyRpcMs: 45.5,
      attempt: 1,
      creditCount: 3,
      usersCredited: 2,
    });

    assert.equal(meta.jobId, 42);
    assert.equal(meta.outcome, "done");
    assert.equal(meta.queueLagMs, 1200);
    assert.equal(meta.usersCredited, 2);
  });

  it("logs errors at warn level", () => {
    const lines: unknown[] = [];
    const log = createLogger("error");
    const origWarn = log.warn.bind(log);
    log.warn = (...args: unknown[]) => {
      lines.push(args);
      origWarn(...args);
    };

    logDingApply(log, {
      jobId: 1,
      roomId: "r",
      drawNumber: 1,
      outcome: "error",
      error: "boom",
    });

    assert.equal(lines.length, 1);
  });

  it("measures elapsed ms", () => {
    const start = nowDingApplyMs();
    const elapsed = elapsedDingApplyMs(start);
    assert.ok(elapsed >= 0);
  });
});
