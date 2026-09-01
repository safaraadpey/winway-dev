import assert from "node:assert/strict";
import test from "node:test";
import { nextProcessorDelayMs } from "./processorSchedule.js";

test("nextProcessorDelayMs returns value within configured bounds", () => {
  for (let i = 0; i < 50; i += 1) {
    const delay = nextProcessorDelayMs("15000", "40000");
    assert.ok(delay >= 15_000 && delay <= 40_000);
  }
});

test("nextProcessorDelayMs accepts swapped min/max", () => {
  const delay = nextProcessorDelayMs("40000", "15000");
  assert.ok(delay >= 15_000 && delay <= 40_000);
});
