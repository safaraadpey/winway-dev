import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dingApplyMeta,
  dingApplyHealthMeta,
  elapsedDingApplyMs,
  logDingApply,
  logDingApplyHealth,
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

  it("builds health meta and warns on critical thresholds", () => {
    const healthy = dingApplyHealthMeta({
      queuedCount: 2,
      processingCount: 1,
      failedCount: 0,
      oldestQueuedAgeMs: 1500,
      oldestProcessingAgeMs: 800,
      staleQueuedCount: 0,
      staleProcessingCount: 0,
      processedDingGapCount: 3,
      historicalGapCount: 0,
      applyErrorCount: 0,
      applyRetryCount: 0,
    });
    assert.equal(healthy.queuedCount, 2);
    assert.equal(healthy.queueLagWarningMs, 30_000);

    const lines: unknown[] = [];
    const log = createLogger("error");
    const origWarn = log.warn.bind(log);
    log.warn = (...args: unknown[]) => {
      lines.push(args);
      origWarn(...args);
    };
    logDingApplyHealth(log, {
      queuedCount: 1,
      processingCount: 0,
      failedCount: 1,
      oldestQueuedAgeMs: 1000,
      oldestProcessingAgeMs: 0,
      staleQueuedCount: 0,
      staleProcessingCount: 0,
      processedDingGapCount: 1,
      historicalGapCount: 0,
      applyErrorCount: 1,
      applyRetryCount: 0,
    });
    assert.equal(lines.length, 1);
  });
});
