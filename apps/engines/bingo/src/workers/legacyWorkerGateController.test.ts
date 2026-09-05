import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger } from "../metrics/logger.js";
import {
  createDrawProcessorGateOptions,
  startLegacyWorkerWithGate,
} from "./legacyWorkerGateController.js";

function createTestLog(): Logger & { lines: unknown[] } {
  const lines: unknown[] = [];
  const log = {
    lines,
    debug: () => undefined,
    info: (_msg: string, payload?: unknown) => {
      lines.push(payload);
    },
    warn: (_msg: string, payload?: unknown) => {
      lines.push(payload);
    },
    error: (_msg: string, payload?: unknown) => {
      lines.push(payload);
    },
  };
  return log;
}

describe("legacyWorkerGateController", () => {
  it("starts worker when config enabled (default path)", async () => {
    let started = 0;
    let stopped = 0;
    const log = createTestLog();
    const stop = startLegacyWorkerWithGate(
      createDrawProcessorGateOptions({
        resolveConfigEnabled: () => true,
        heartbeatMs: 60_000,
        log,
        fetchSnapshot: async () => ({
          activePerDrawRooms: 0,
          drawJobsQueued: 0,
          drawJobsProcessing: 0,
          drawJobsFailed: 0,
          terminalManifestRamDrawJobsPending: 0,
        }),
        startWorker: () => {
          started += 1;
          return () => {
            stopped += 1;
          };
        },
      })
    );

    await new Promise((r) => setTimeout(r, 20));
    assert.equal(started, 1);
    stop();
    assert.equal(stopped, 1);
    assert.ok(
      log.lines.some(
        (line) =>
          typeof line === "object" &&
          line !== null &&
          (line as { worker?: string }).worker === "drawProcessor" &&
          (line as { enabled?: boolean }).enabled === true
      )
    );
  });

  it("does not start worker when disabled and queue clear", async () => {
    let started = 0;
    const log = createTestLog();
    const stop = startLegacyWorkerWithGate(
      createDrawProcessorGateOptions({
        resolveConfigEnabled: () => false,
        heartbeatMs: 60_000,
        log,
        fetchSnapshot: async () => ({
          activePerDrawRooms: 0,
          drawJobsQueued: 0,
          drawJobsProcessing: 0,
          drawJobsFailed: 0,
          terminalManifestRamDrawJobsPending: 0,
        }),
        startWorker: () => {
          started += 1;
          return () => undefined;
        },
      })
    );

    await new Promise((r) => setTimeout(r, 20));
    assert.equal(started, 0);
    stop();
    assert.ok(
      log.lines.some(
        (line) =>
          typeof line === "object" &&
          line !== null &&
          (line as { workerIdle?: boolean }).workerIdle === true
      )
    );
  });

  it("starts worker when disabled but pending jobs refuse gate", async () => {
    let started = 0;
    const log = createTestLog();
    const stop = startLegacyWorkerWithGate(
      createDrawProcessorGateOptions({
        resolveConfigEnabled: () => false,
        heartbeatMs: 60_000,
        log,
        fetchSnapshot: async () => ({
          activePerDrawRooms: 0,
          drawJobsQueued: 2,
          drawJobsProcessing: 0,
          drawJobsFailed: 0,
          terminalManifestRamDrawJobsPending: 2,
        }),
        startWorker: () => {
          started += 1;
          return () => undefined;
        },
      })
    );

    await new Promise((r) => setTimeout(r, 20));
    assert.equal(started, 1);
    stop();
    assert.ok(
      log.lines.some(
        (line) =>
          typeof line === "object" &&
          line !== null &&
          typeof (line as { refusalReason?: string }).refusalReason ===
            "string" &&
          (line as { refusalReason?: string }).refusalReason!.includes(
            "draw_jobs_queued=2"
          )
      )
    );
  });

  it("restarts worker when flag toggled back to enabled on heartbeat", async () => {
    let configEnabled = false;
    let started = 0;
    let stopped = 0;
    const log = createTestLog();
    const stop = startLegacyWorkerWithGate(
      createDrawProcessorGateOptions({
        resolveConfigEnabled: () => configEnabled,
        heartbeatMs: 30,
        log,
        fetchSnapshot: async () => ({
          activePerDrawRooms: 0,
          drawJobsQueued: 0,
          drawJobsProcessing: 0,
          drawJobsFailed: 0,
          terminalManifestRamDrawJobsPending: 0,
        }),
        startWorker: () => {
          started += 1;
          return () => {
            stopped += 1;
          };
        },
      })
    );

    await new Promise((r) => setTimeout(r, 20));
    assert.equal(started, 0);

    configEnabled = true;
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(started, 1);

    stop();
    assert.equal(stopped, 1);
  });
});
