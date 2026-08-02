import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runMarkingBenchmark } from "./marking-benchmark.js";

describe("marking-benchmark", () => {
  it("runs without throwing", () => {
    assert.doesNotThrow(() => runMarkingBenchmark());
  });
});
