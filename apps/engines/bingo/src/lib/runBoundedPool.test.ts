import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runBoundedPool } from "./runBoundedPool.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("runBoundedPool", () => {
  it("resolves immediately for empty items", async () => {
    await runBoundedPool([], 8, async () => {
      assert.fail("should not run");
    });
  });

  it("runs serially when concurrency=1", async () => {
    const order: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    await runBoundedPool([0, 1, 2], 1, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(5);
      order.push(item);
      inFlight -= 1;
    });

    assert.deepEqual(order, [0, 1, 2]);
    assert.equal(maxInFlight, 1);
  });

  it("caps in-flight work at concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await runBoundedPool(Array.from({ length: 20 }, (_, i) => i), 8, async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(10);
      inFlight -= 1;
    });

    assert.ok(maxInFlight <= 8);
    assert.ok(maxInFlight >= 2);
  });

  it("isolates per-item failures when fn catches errors", async () => {
    const completed: number[] = [];

    await runBoundedPool([1, 2, 3], 3, async (item) => {
      try {
        if (item === 2) throw new Error("boom");
        completed.push(item);
      } catch {
        // per-item isolation (ding-processor pattern)
      }
    });

    assert.deepEqual(completed.sort(), [1, 3]);
  });
});
