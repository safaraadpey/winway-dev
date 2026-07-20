import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger } from "../metrics/logger.js";
import type { GameRedis } from "./types.js";
import {
  acquireLeaderLock,
  acquireLeaderLockWithTimeout,
  releaseLeaderLock,
} from "./leaderLock.js";

const noopLog: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function mockRedis(overrides: Partial<GameRedis> = {}): GameRedis {
  return {
    backend: "upstash-rest",
    ping: async () => true,
    tryAcquireLock: async () => true,
    renewLock: async () => true,
    releaseLock: async () => {},
    setJsonEx: async () => {},
    deleteKey: async () => {},
    evalScript: async () => 1,
    close: async () => {},
    ...overrides,
  };
}

describe("acquireLeaderLock", () => {
  it("proceeds without redis (single-instance)", async () => {
    const degraded = { value: false };
    const result = await acquireLeaderLock({
      redis: null,
      lockKey: "k",
      ttlSec: 30,
      token: "t",
      worker: "test-worker",
      log: noopLog,
      degraded,
    });
    assert.equal(result.proceed, true);
    assert.equal(result.lockHeld, false);
  });

  it("skips tick when peer holds lock", async () => {
    const redis = mockRedis({ tryAcquireLock: async () => false });
    const result = await acquireLeaderLock({
      redis,
      lockKey: "k",
      ttlSec: 30,
      token: "t",
      worker: "test-worker",
      log: noopLog,
      degraded: { value: false },
    });
    assert.equal(result.proceed, false);
    assert.equal(result.lockHeld, false);
  });

  it("degrades and proceeds when redis throws", async () => {
    const warnings: string[] = [];
    const log: Logger = {
      ...noopLog,
      warn: (msg) => {
        warnings.push(String(msg));
      },
    };
    const redis = mockRedis({
      tryAcquireLock: async () => {
        throw new Error("ERR max requests limit exceeded");
      },
    });
    const degraded = { value: false };
    const result = await acquireLeaderLock({
      redis,
      lockKey: "k",
      ttlSec: 30,
      token: "t",
      worker: "dev-player-scheduler",
      log,
      degraded,
    });
    assert.equal(result.proceed, true);
    assert.equal(result.lockHeld, false);
    assert.equal(degraded.value, true);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /single-instance mode/);
  });

  it("fail-closed without redis when coordination strict", async () => {
    const result = await acquireLeaderLock({
      redis: null,
      lockKey: "k",
      ttlSec: 30,
      token: "t",
      worker: "test-worker",
      log: noopLog,
      degraded: { value: false },
      coordinationStrict: true,
      engineReplicaCount: 1,
    });
    assert.equal(result.proceed, false);
  });
});

describe("acquireLeaderLockWithTimeout", () => {
  it("returns timedOut when redis is slower than the budget", async () => {
    const redis = mockRedis({
      tryAcquireLock: async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return true;
      },
    });

    const result = await acquireLeaderLockWithTimeout({
      redis,
      lockKey: "k",
      ttlSec: 30,
      token: "t",
      worker: "test-worker",
      log: noopLog,
      degraded: { value: false },
      timeoutMs: 20,
    });

    assert.equal(result.proceed, false);
    assert.equal(result.lockHeld, false);
    assert.equal(result.timedOut, true);
  });
});

describe("releaseLeaderLock", () => {
  it("no-ops when lock was not held", async () => {
    let released = false;
    const redis = mockRedis({
      releaseLock: async () => {
        released = true;
      },
    });
    await releaseLeaderLock({
      redis,
      lockKey: "k",
      token: "t",
      lockHeld: false,
      worker: "test-worker",
      log: noopLog,
    });
    assert.equal(released, false);
  });
});
