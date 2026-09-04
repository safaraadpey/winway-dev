import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EngineConfig } from "../../config/env.js";
import type { ClockDrawPayload } from "../../domain/room-loop/clockDrawPayload.js";
import {
  FULL_HOUSE_FROZEN_POLL_MS,
  fullHouseFrozenWait,
} from "../../domain/room-loop/runDrawCycle.js";
import type { RoomRow } from "../../repositories/types.js";
import { RoomPersistQueue } from "./roomPersistQueue.js";
import { RoomGameActor, type RoomActorDeps } from "./roomGameActor.js";

function samplePayload(
  overrides: Partial<ClockDrawPayload> = {}
): ClockDrawPayload {
  return {
    seq: 1,
    number: 40,
    drawnAtIso: "2026-01-01T12:00:00.000Z",
    actorDueAtIso: "2026-01-01T12:00:00.000Z",
    nextDueAtIso: "2026-01-01T12:00:03.000Z",
    persistence: {
      marks: [],
      results: [],
      setFirstLineDrawNumber: false,
    },
    ding: { dingPerCard: 0, credits: [] },
    fullWinnerThisDraw: true,
    ...overrides,
  };
}

function makeRoom(): RoomRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    status: "playing",
    currency: "IRR",
    room_seed: null,
    room_template_id: null,
    next_draw_at: new Date(Date.now() - 1000).toISOString(),
    starts_at: null,
    min_players: 1,
    max_players: null,
    countdown_sec: 120,
    first_line_draw_number: null,
    line_reward_percentage: null,
    full_reward_percentage: null,
    ding_per_number: null,
    meta: null,
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("full-house actor + persist lifecycle", () => {
  it("keeps actor owned until slow persist completes, then exits once", async () => {
    let persistCalls = 0;
    const exitReasons: string[] = [];
    let renewCalls = 0;
    let cycleCalls = 0;
    let enqueued = false;

    const repo = {
      renewLease: async () => {
        renewCalls += 1;
        return true;
      },
    };

    const deps: RoomActorDeps = {
      supabase: {} as RoomActorDeps["supabase"],
      repo: repo as RoomActorDeps["repo"],
      log: { info: () => {}, warn: () => {}, error: () => {} },
      config: { roomLoopMaxUnprocessedDraws: 2 } as EngineConfig,
      redis: null,
      stateManager: {} as RoomActorDeps["stateManager"],
      ownerId: "engine:test",
      leaseSeconds: 30,
      leaseFence: { ownerId: "engine:test", leaseEpoch: 1 },
      metrics: {
        noteCycle: () => {},
        noteLeaseLost: () => {},
        noteError: () => {},
      } as RoomActorDeps["metrics"],
      getCardRegistry: () => null,
      onExit: (_roomId, reason) => {
        exitReasons.push(reason);
      },
    };

    const actor = new RoomGameActor(makeRoom(), "actor", deps, async (a) => {
      cycleCalls += 1;
      if (!enqueued) {
        enqueued = true;
        a.persistQueue.enqueue(samplePayload());
        return fullHouseFrozenWait();
      }
      return fullHouseFrozenWait();
    });

    (actor as unknown as { persistQueue: RoomPersistQueue }).persistQueue =
      new RoomPersistQueue(
        actor,
        () => {},
        {
          persist: async () => {
            persistCalls += 1;
            await new Promise((r) => setTimeout(r, 1200));
            return "done";
          },
          delay: async () => {},
        }
      );

    actor.noteLeaseRenewed(Date.now() - 20_000);
    actor.start();

    await flushMicrotasks();
    await new Promise((r) => setTimeout(r, 600));

    assert.equal(persistCalls, 1);
    assert.equal(enqueued, true);
    assert.deepEqual(exitReasons, []);
    assert.ok(cycleCalls >= 1);
    assert.ok(renewCalls >= 1, "lease renew while waiting for persist");

    await new Promise((r) => setTimeout(r, 900));

    assert.equal(persistCalls, 1, "winning draw persists exactly once");
    assert.deepEqual(exitReasons, ["exhausted"]);
    actor.stop();
  });

  it("persist failure still uses retry then persist-failed exit path", async () => {
    let persistCalls = 0;
    let exitReason: string | null = null;
    let markRecovery = 0;

    const deps: RoomActorDeps = {
      supabase: {} as RoomActorDeps["supabase"],
      repo: {
        renewLease: async () => true,
      } as RoomActorDeps["repo"],
      log: { info: () => {}, warn: () => {}, error: () => {} },
      config: { roomLoopMaxUnprocessedDraws: 2 } as EngineConfig,
      redis: null,
      stateManager: {} as RoomActorDeps["stateManager"],
      ownerId: "engine:test",
      leaseSeconds: 30,
      leaseFence: { ownerId: "engine:test", leaseEpoch: 1 },
      metrics: {
        noteCycle: () => {},
        noteLeaseLost: () => {},
        noteError: () => {},
      } as RoomActorDeps["metrics"],
      getCardRegistry: () => null,
      onExit: (_roomId, reason) => {
        exitReason = reason;
      },
    };

    const actor = new RoomGameActor(makeRoom(), "actor", deps, async (a) => {
      a.persistQueue.enqueue(samplePayload());
      return fullHouseFrozenWait();
    });

    const originalMarkRecovery = actor.markNeedsRecovery.bind(actor);
    actor.markNeedsRecovery = () => {
      markRecovery += 1;
      originalMarkRecovery();
    };

    (actor as unknown as { persistQueue: RoomPersistQueue }).persistQueue =
      new RoomPersistQueue(
        actor,
        () => {},
        {
          persist: async () => {
            persistCalls += 1;
            throw new Error("statement timeout");
          },
          delay: async () => {},
        }
      );

    actor.start();
    await flushMicrotasks();
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(persistCalls, 4);
    assert.equal(markRecovery, 1);
    assert.equal(exitReason, "persist-failed");
    actor.stop();
  });

  it("frozen idle cycles do not exit before persist (no claim/release thrash)", async () => {
    let cycleCalls = 0;
    const exitReasons: string[] = [];

    const deps: RoomActorDeps = {
      supabase: {} as RoomActorDeps["supabase"],
      repo: {
        renewLease: async () => true,
      } as RoomActorDeps["repo"],
      log: { info: () => {}, warn: () => {}, error: () => {} },
      config: { roomLoopMaxUnprocessedDraws: 2 } as EngineConfig,
      redis: null,
      stateManager: {} as RoomActorDeps["stateManager"],
      ownerId: "engine:test",
      leaseSeconds: 30,
      leaseFence: { ownerId: "engine:test", leaseEpoch: 1 },
      metrics: {
        noteCycle: () => {},
        noteLeaseLost: () => {},
        noteError: () => {},
      } as RoomActorDeps["metrics"],
      getCardRegistry: () => null,
      onExit: (_roomId, reason) => {
        exitReasons.push(reason);
      },
    };

    let persistStarted: (() => void) | null = null;
    let releasePersist!: () => void;
    const persistGate = new Promise<void>((resolve) => {
      releasePersist = resolve;
    });

    const actor = new RoomGameActor(makeRoom(), "actor", deps, async (a) => {
      cycleCalls += 1;
      if (cycleCalls === 1) {
        a.persistQueue.enqueue(samplePayload());
      }
      return fullHouseFrozenWait();
    });

    (actor as unknown as { persistQueue: RoomPersistQueue }).persistQueue =
      new RoomPersistQueue(
        actor,
        () => {},
        {
          persist: async () => {
            persistStarted?.();
            await persistGate;
            return "done";
          },
          delay: async () => {},
        }
      );

    actor.noteLeaseRenewed(Date.now() - 20_000);
    actor.start();

    await flushMicrotasks();
    await new Promise((r) => setTimeout(r, FULL_HOUSE_FROZEN_POLL_MS + 100));

    assert.ok(cycleCalls >= 2, "reclaim-style cycles while frozen must not exit");
    assert.deepEqual(exitReasons, []);

    releasePersist();
    await new Promise((r) => setTimeout(r, 50));

    assert.deepEqual(exitReasons, ["exhausted"]);
    actor.stop();
  });

  it("idle full-house result does not trigger clock-side exit", async () => {
    const exitReasons: string[] = [];

    const deps: RoomActorDeps = {
      supabase: {} as RoomActorDeps["supabase"],
      repo: {
        renewLease: async () => true,
      } as RoomActorDeps["repo"],
      log: { info: () => {}, warn: () => {}, error: () => {} },
      config: { roomLoopMaxUnprocessedDraws: 2 } as EngineConfig,
      redis: null,
      stateManager: {} as RoomActorDeps["stateManager"],
      ownerId: "engine:test",
      leaseSeconds: 30,
      leaseFence: { ownerId: "engine:test", leaseEpoch: 1 },
      metrics: {
        noteCycle: () => {},
        noteLeaseLost: () => {},
        noteError: () => {},
      } as RoomActorDeps["metrics"],
      getCardRegistry: () => null,
      onExit: (_roomId, reason) => {
        exitReasons.push(reason);
      },
    };

    const actor = new RoomGameActor(
      makeRoom(),
      "actor",
      deps,
      async () => fullHouseFrozenWait()
    );

    actor.start();
    await flushMicrotasks();
    await new Promise((r) => setTimeout(r, FULL_HOUSE_FROZEN_POLL_MS + 50));

    assert.deepEqual(exitReasons, []);
    actor.stop();
  });
});
