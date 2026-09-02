import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertClockTimestamps,
  type ClockDrawPayload,
} from "./clockDrawPayload.js";

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

describe("ClockDrawPayload", () => {
  it("requires drawnAtIso and nextDueAtIso", () => {
    assert.doesNotThrow(() => assertClockTimestamps(samplePayload()));
    assert.throws(
      () => assertClockTimestamps(samplePayload({ drawnAtIso: "" })),
      /drawnAtIso/
    );
    assert.throws(
      () => assertClockTimestamps(samplePayload({ nextDueAtIso: "" })),
      /nextDueAtIso/
    );
  });

  it("preserves clock timestamps for delayed persist", () => {
    const drawnAt = "2026-01-01T12:00:00.000Z";
    const nextDue = "2026-01-01T12:00:03.500Z";
    const payload = samplePayload({
      drawnAtIso: drawnAt,
      nextDueAtIso: nextDue,
    });
    assert.equal(payload.drawnAtIso, drawnAt);
    assert.equal(payload.nextDueAtIso, nextDue);
  });
});
