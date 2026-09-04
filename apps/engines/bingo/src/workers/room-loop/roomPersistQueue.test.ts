import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClockDrawPayload } from "../../domain/room-loop/clockDrawPayload.js";
import type { EngineJobOutcome } from "../../domain/draw/processEngineDrawJob.js";
import type { RoomGameActor } from "./roomGameActor.js";
import { RoomPersistQueue } from "./roomPersistQueue.js";

const TIMEOUT_MSG =
  "repo rpc_finalize_engine_draw_job: canceling statement due to statement timeout";

function samplePayload(overrides: Partial<ClockDrawPayload> = {}): ClockDrawPayload {
  return {
    seq: 1,
    number: 7,
    drawnAtIso: "2026-01-01T12:00:00.000Z",
    actorDueAtIso: "2026-01-01T12:00:00.000Z",
    nextDueAtIso: "2026-01-01T12:00:03.000Z",
    persistence: {
      marks: [],
      results: [],
      setFirstLineDrawNumber: false,
    },
    ding: { dingPerCard: 0, credits: [] },
    fullWinnerThisDraw: false,
    ...overrides,
  };
}

function stubActor(overrides: {
  markNeedsRecovery?: () => void;
  exitAfterPersist?: (reason: string) => void;
} = {}): RoomGameActor {
  const log = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  return {
    roomId: "00000000-0000-4000-8000-000000000001",
    log,
    markNeedsRecovery: overrides.markNeedsRecovery ?? (() => {}),
    exitAfterPersist: overrides.exitAfterPersist ?? (() => {}),
    repo: {
      getOldestUnprocessedDraw: async () => null,
    },
    metrics: { noteRecovery: () => {} },
  } as unknown as RoomGameActor;
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("RoomPersistQueue", () => {
  it("retries once after statement timeout then succeeds", async () => {
    let persistCalls = 0;
    const delays: number[] = [];
    const outcomes: EngineJobOutcome[] = [];

    const queue = new RoomPersistQueue(
      stubActor(),
      (outcome) => outcomes.push(outcome),
      {
        persist: async () => {
          persistCalls += 1;
          if (persistCalls === 1) {
            throw new Error(TIMEOUT_MSG);
          }
          return "done";
        },
        delay: async (ms) => {
          delays.push(ms);
        },
      }
    );

    queue.enqueue(samplePayload());
    await flushMicrotasks();

    assert.equal(persistCalls, 2);
    assert.deepEqual(delays, [250]);
    assert.deepEqual(outcomes, ["done"]);
    assert.equal(queue.isStopped(), false);
  });

  it("retries multiple transient failures then succeeds", async () => {
    let persistCalls = 0;
    const delays: number[] = [];
    const outcomes: EngineJobOutcome[] = [];

    const queue = new RoomPersistQueue(
      stubActor(),
      (outcome) => outcomes.push(outcome),
      {
        persist: async () => {
          persistCalls += 1;
          if (persistCalls <= 2) {
            throw new Error(TIMEOUT_MSG);
          }
          return "done";
        },
        delay: async (ms) => {
          delays.push(ms);
        },
      }
    );

    queue.enqueue(samplePayload());
    await flushMicrotasks();

    assert.equal(persistCalls, 3);
    assert.deepEqual(delays, [250, 500]);
    assert.deepEqual(outcomes, ["done"]);
  });

  it("exhausts retries without unhandled rejection and triggers recovery exit", async () => {
    let persistCalls = 0;
    let unhandled = 0;
    let markRecovery = 0;
    let exitReason: string | null = null;
    const outcomes: EngineJobOutcome[] = [];

    const onUnhandled = (): void => {
      unhandled += 1;
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const queue = new RoomPersistQueue(
        stubActor({
          markNeedsRecovery: () => {
            markRecovery += 1;
          },
          exitAfterPersist: (reason) => {
            exitReason = reason;
          },
        }),
        (outcome) => outcomes.push(outcome),
        {
          persist: async () => {
            persistCalls += 1;
            throw new Error(TIMEOUT_MSG);
          },
          delay: async () => {},
        }
      );

      queue.enqueue(samplePayload());
      await flushMicrotasks();
      await new Promise((r) => setTimeout(r, 10));

      assert.equal(persistCalls, 4);
      assert.equal(unhandled, 0);
      assert.equal(markRecovery, 1);
      assert.equal(exitReason, "persist-failed");
      assert.equal(queue.isStopped(), true);
      assert.deepEqual(outcomes, []);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("preserves per-room draw ordering during retry", async () => {
    const persistOrder: number[] = [];
    let failSeq1Once = true;

    const queue = new RoomPersistQueue(
      stubActor(),
      () => {},
      {
        persist: async (_actor, payload) => {
          persistOrder.push(payload.seq);
          if (payload.seq === 1 && failSeq1Once) {
            failSeq1Once = false;
            throw new Error(TIMEOUT_MSG);
          }
          return "done";
        },
        delay: async () => {},
      }
    );

    queue.enqueue(samplePayload({ seq: 2, number: 8 }));
    queue.enqueue(samplePayload({ seq: 1, number: 7 }));
    await flushMicrotasks();

    assert.deepEqual(persistOrder, [1, 1, 2]);
  });

  it("does not retry explicit fenced result", async () => {
    let persistCalls = 0;
    const delays: number[] = [];
    const outcomes: EngineJobOutcome[] = [];
    let markRecovery = 0;

    const queue = new RoomPersistQueue(
      stubActor({
        markNeedsRecovery: () => {
          markRecovery += 1;
        },
      }),
      (outcome) => outcomes.push(outcome),
      {
        persist: async () => {
          persistCalls += 1;
          return "fenced";
        },
        delay: async (ms) => {
          delays.push(ms);
        },
      }
    );

    queue.enqueue(samplePayload());
    await flushMicrotasks();

    assert.equal(persistCalls, 1);
    assert.deepEqual(delays, []);
    assert.deepEqual(outcomes, ["fenced"]);
    assert.equal(markRecovery, 0);
    assert.equal(queue.isStopped(), true);
  });
});
