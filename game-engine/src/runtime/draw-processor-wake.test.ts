import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  registerDrawProcessorWake,
  wakeDrawProcessor,
} from "./draw-processor-wake.js";

describe("draw-processor-wake", () => {
  it("delivers wake reason to registered listener", () => {
    const reasons: string[] = [];
    const unregister = registerDrawProcessorWake((reason) => {
      reasons.push(reason);
    });
    wakeDrawProcessor("enqueue");
    unregister();
    assert.deepEqual(reasons, ["enqueue"]);
  });

  it("no-ops when no listener is registered", () => {
    assert.doesNotThrow(() => wakeDrawProcessor("enqueue"));
  });
});
