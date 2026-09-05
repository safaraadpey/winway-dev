import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyBulkHistoryDrawJobs,
  drawJobsPendingTotal,
  resolveLegacyDrawProcessorGate,
  resolveLegacyDingProcessorGate,
  type LegacyDrawGateSnapshot,
  type LegacyDingGateSnapshot,
} from "./legacyWorkerGate.js";

const emptyDrawSnapshot = (): LegacyDrawGateSnapshot => ({
  activePerDrawRooms: 0,
  drawJobsQueued: 0,
  drawJobsProcessing: 0,
  drawJobsFailed: 0,
  terminalManifestRamDrawJobsPending: 0,
});

const emptyDingSnapshot = (): LegacyDingGateSnapshot => ({
  activePerDrawDingRooms: 0,
  dingJobsQueued: 0,
  dingJobsProcessing: 0,
  dingJobsFailed: 0,
});

describe("legacyWorkerGate draw processor", () => {
  it("default config enabled keeps worker active", () => {
    const decision = resolveLegacyDrawProcessorGate(true, {
      ...emptyDrawSnapshot(),
      activePerDrawRooms: 2,
      drawJobsQueued: 5,
    });
    assert.equal(decision.effectiveEnabled, true);
    assert.equal(decision.workerStarted, true);
    assert.equal(decision.reason, "config_enabled");
    assert.equal(decision.refusalReason, null);
  });

  it("config disabled with zero queue and rooms enters idle", () => {
    const decision = resolveLegacyDrawProcessorGate(
      false,
      emptyDrawSnapshot()
    );
    assert.equal(decision.effectiveEnabled, false);
    assert.equal(decision.workerStarted, false);
    assert.equal(decision.workerIdle, true);
    assert.equal(decision.reason, "gate_disabled_idle");
  });

  it("config disabled with pending draw_jobs refuses disable", () => {
    const decision = resolveLegacyDrawProcessorGate(false, {
      ...emptyDrawSnapshot(),
      drawJobsQueued: 3,
    });
    assert.equal(decision.effectiveEnabled, true);
    assert.equal(decision.workerStarted, true);
    assert.equal(decision.reason, "fail_closed_keep_active");
    assert.match(decision.refusalReason ?? "", /draw_jobs_queued=3/);
  });

  it("config disabled with active per_draw room refuses disable", () => {
    const decision = resolveLegacyDrawProcessorGate(false, {
      ...emptyDrawSnapshot(),
      activePerDrawRooms: 1,
    });
    assert.equal(decision.effectiveEnabled, true);
    assert.match(decision.refusalReason ?? "", /active_per_draw_rooms=1/);
  });

  it("counts failed draw jobs as pending for fail-closed", () => {
    const snapshot = { ...emptyDrawSnapshot(), drawJobsFailed: 2 };
    assert.equal(drawJobsPendingTotal(snapshot), 2);
    const decision = resolveLegacyDrawProcessorGate(false, snapshot);
    assert.equal(decision.effectiveEnabled, true);
    assert.match(decision.refusalReason ?? "", /draw_jobs_failed=2/);
  });
});

describe("legacyWorkerGate ding processor", () => {
  it("default config enabled keeps worker active", () => {
    const decision = resolveLegacyDingProcessorGate(true, {
      ...emptyDingSnapshot(),
      dingJobsQueued: 1,
    });
    assert.equal(decision.effectiveEnabled, true);
    assert.equal(decision.reason, "config_enabled");
  });

  it("config disabled with zero queue and rooms enters idle", () => {
    const decision = resolveLegacyDingProcessorGate(
      false,
      emptyDingSnapshot()
    );
    assert.equal(decision.effectiveEnabled, false);
    assert.equal(decision.workerIdle, true);
  });

  it("config disabled with pending ding jobs refuses disable", () => {
    const decision = resolveLegacyDingProcessorGate(false, {
      ...emptyDingSnapshot(),
      dingJobsProcessing: 1,
    });
    assert.equal(decision.effectiveEnabled, true);
    assert.match(decision.refusalReason ?? "", /ding_jobs_processing=1/);
  });

  it("config disabled with active per_draw ding room refuses disable", () => {
    const decision = resolveLegacyDingProcessorGate(false, {
      ...emptyDingSnapshot(),
      activePerDrawDingRooms: 1,
    });
    assert.equal(decision.effectiveEnabled, true);
    assert.match(decision.refusalReason ?? "", /active_per_draw_ding_rooms=1/);
  });
});

describe("legacyWorkerGate rollback readiness", () => {
  it("legacy draw flag true enables worker regardless of manifest mode (env-only rollback)", () => {
    const decision = resolveLegacyDrawProcessorGate(true, emptyDrawSnapshot());
    assert.equal(decision.effectiveEnabled, true);
    assert.equal(decision.configEnabled, true);
  });

  it("legacy ding flag true enables worker for per_draw fallback without redeploy", () => {
    const decision = resolveLegacyDingProcessorGate(true, {
      ...emptyDingSnapshot(),
      activePerDrawDingRooms: 4,
      dingJobsQueued: 10,
    });
    assert.equal(decision.effectiveEnabled, true);
    assert.equal(decision.workerStarted, true);
  });
});

describe("legacyWorkerGate bulk history classification", () => {
  it("reports none when no terminal jobs pending", () => {
    assert.equal(
      classifyBulkHistoryDrawJobs(emptyDrawSnapshot()),
      "none_pending"
    );
  });

  it("classifies terminal manifest_ram queued jobs as noop drain only", () => {
    assert.equal(
      classifyBulkHistoryDrawJobs({
        ...emptyDrawSnapshot(),
        drawJobsQueued: 4,
        terminalManifestRamDrawJobsPending: 4,
      }),
      "terminal_manifest_ram_noop_drain_only"
    );
  });

  it("classifies mixed pending jobs", () => {
    assert.equal(
      classifyBulkHistoryDrawJobs({
        ...emptyDrawSnapshot(),
        drawJobsQueued: 4,
        terminalManifestRamDrawJobsPending: 2,
      }),
      "terminal_manifest_ram_mixed_or_active_drain"
    );
  });
});
