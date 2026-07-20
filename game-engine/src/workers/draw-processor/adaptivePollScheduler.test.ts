import assert from "node:assert/strict";
import { describe, it, mock, beforeEach, afterEach } from "node:test";
import type { Logger } from "../../metrics/logger.js";
import { createAdaptivePollScheduler } from "./adaptivePollScheduler.js";
import { acquireLeaderLock } from "../../redis/leaderLock.js";
import type { GameRedis } from "../../redis/types.js";

const noopLog: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe("createAdaptivePollScheduler", () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout"] });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it("single replica empty queue backs off to 5s max", () => {
    const polls: number[] = [];
    const scheduler = createAdaptivePollScheduler({
      baseIntervalMs: 500,
      enabled: true,
      log: noopLog,
      onPoll: () => polls.push(Date.now()),
    });

    scheduler.start();
    assert.equal(polls.length, 1);

    for (let i = 0; i < 3; i++) {
      scheduler.notifyPollCycle({
        totalPicked: 0,
        totalDispatched: 0,
        rpcAttemptedEmpty: true,
        lockDeferred: false,
      });
    }

    const diag = scheduler.getDiagnostics();
    assert.equal(diag.currentDelayMs, 5000);
    assert.equal(diag.emptyPollStreak, 3);

    mock.timers.tick(5000);
    assert.equal(polls.length, 2);
    scheduler.stop();
  });

  it("lockDeferred progresses backoff like empty idle", () => {
    const scheduler = createAdaptivePollScheduler({
      baseIntervalMs: 500,
      enabled: true,
      log: noopLog,
      onPoll: () => undefined,
    });
    scheduler.start();

    scheduler.notifyPollCycle({
      totalPicked: 0,
      totalDispatched: 0,
      rpcAttemptedEmpty: false,
      lockDeferred: true,
    });
    assert.equal(scheduler.getDiagnostics().currentDelayMs, 1000);

    scheduler.notifyPollCycle({
      totalPicked: 0,
      totalDispatched: 0,
      rpcAttemptedEmpty: false,
      lockDeferred: true,
    });
    assert.equal(scheduler.getDiagnostics().currentDelayMs, 2000);
    scheduler.stop();
  });

  it("successful dispatch resets backoff to fast interval", () => {
    const scheduler = createAdaptivePollScheduler({
      baseIntervalMs: 500,
      enabled: true,
      log: noopLog,
      onPoll: () => undefined,
    });
    scheduler.start();

    scheduler.notifyPollCycle({
      totalPicked: 0,
      totalDispatched: 0,
      rpcAttemptedEmpty: true,
      lockDeferred: false,
    });
    assert.equal(scheduler.getDiagnostics().currentDelayMs, 1000);

    scheduler.notifyPollCycle({
      totalPicked: 1,
      totalDispatched: 1,
      rpcAttemptedEmpty: false,
      lockDeferred: false,
    });
    assert.equal(scheduler.getDiagnostics().currentDelayMs, 500);
    assert.equal(scheduler.getDiagnostics().emptyPollStreak, 0);
    scheduler.stop();
  });

  it("standby replica retries after leader failure within max backoff", () => {
    let polls = 0;
    const scheduler = createAdaptivePollScheduler({
      baseIntervalMs: 500,
      enabled: true,
      log: noopLog,
      onPoll: () => {
        polls += 1;
      },
    });
    scheduler.start();
    polls = 0;

    for (let i = 0; i < 3; i++) {
      scheduler.notifyPollCycle({
        totalPicked: 0,
        totalDispatched: 0,
        rpcAttemptedEmpty: false,
        lockDeferred: true,
      });
    }
    assert.equal(scheduler.getDiagnostics().currentDelayMs, 5000);

    mock.timers.tick(5000);
    assert.equal(polls, 1);

    scheduler.notifyPollCycle({
      totalPicked: 0,
      totalDispatched: 0,
      rpcAttemptedEmpty: true,
      lockDeferred: false,
    });
    assert.equal(scheduler.getDiagnostics().currentDelayMs, 5000);
    scheduler.stop();
  });
});

describe("acquireLeaderLock strict mode", () => {
  it("fail-closed without redis when coordination strict", async () => {
    const result = await acquireLeaderLock({
      redis: null,
      lockKey: "k",
      ttlSec: 30,
      token: "t",
      worker: "draw-processor",
      log: noopLog,
      degraded: { value: false },
      coordinationStrict: true,
      engineReplicaCount: 2,
    });
    assert.equal(result.proceed, false);
    assert.equal(result.lockHeld, false);
  });
});

describe("two-replica lock deferral (simulated)", () => {
  it("losing replica backs off while winner polls at fast base until idle", () => {
    const loser = createAdaptivePollScheduler({
      baseIntervalMs: 500,
      enabled: true,
      log: noopLog,
      onPoll: () => undefined,
    });
    const winner = createAdaptivePollScheduler({
      baseIntervalMs: 500,
      enabled: true,
      log: noopLog,
      onPoll: () => undefined,
    });

    loser.start();
    winner.start();

    loser.notifyPollCycle({
      totalPicked: 0,
      totalDispatched: 0,
      rpcAttemptedEmpty: false,
      lockDeferred: true,
    });
    winner.notifyPollCycle({
      totalPicked: 0,
      totalDispatched: 0,
      rpcAttemptedEmpty: true,
      lockDeferred: false,
    });

    assert.equal(loser.getDiagnostics().currentDelayMs, 1000);
    assert.equal(winner.getDiagnostics().currentDelayMs, 1000);

    loser.stop();
    winner.stop();
  });
});

describe("leader lock mutual exclusion", () => {
  it("only one mock redis holder proceeds", async () => {
    let holder: string | null = null;
    const redis: GameRedis = {
      backend: "upstash-rest",
      ping: async () => true,
      tryAcquireLock: async (_key, token, _ttl) => {
        if (holder === null) {
          holder = token;
          return true;
        }
        return holder === token;
      },
      renewLock: async () => true,
      releaseLock: async (_key, token) => {
        if (holder === token) holder = null;
      },
      setJsonEx: async () => {},
      deleteKey: async () => {},
      evalScript: async () => 1,
      close: async () => {},
    };

    const a = await acquireLeaderLock({
      redis,
      lockKey: "draw-picker",
      ttlSec: 30,
      token: "a",
      worker: "draw-processor",
      log: noopLog,
      degraded: { value: false },
      coordinationStrict: true,
      engineReplicaCount: 2,
    });
    const b = await acquireLeaderLock({
      redis,
      lockKey: "draw-picker",
      ttlSec: 30,
      token: "b",
      worker: "draw-processor",
      log: noopLog,
      degraded: { value: false },
      coordinationStrict: true,
      engineReplicaCount: 2,
    });

    assert.equal(a.proceed, true);
    assert.equal(a.lockHeld, true);
    assert.equal(b.proceed, false);
    assert.equal(b.lockHeld, false);
  });
});
