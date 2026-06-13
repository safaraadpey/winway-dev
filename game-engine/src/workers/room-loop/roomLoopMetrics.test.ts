import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RoomLoopMetrics } from "./roomLoopMetrics.js";

describe("RoomLoopMetrics", () => {
  it("accumulates counters and snapshots active rooms", () => {
    const m = new RoomLoopMetrics();
    m.noteClaimed();
    m.noteClaimed();
    m.noteClaimFailed();
    m.noteCycle();
    m.noteDrawInserted();
    m.noteBackpressure();
    m.noteRecovery();
    m.noteShadowDecision();
    m.noteShadowMismatch();
    m.noteLeaseLost();
    m.noteReleased();
    m.noteError();

    const snap = m.snapshot(3);
    assert.equal(snap.claimed, 2);
    assert.equal(snap.claimFailed, 1);
    assert.equal(snap.cyclesRun, 1);
    assert.equal(snap.drawsInserted, 1);
    assert.equal(snap.backpressureSkips, 1);
    assert.equal(snap.recoveries, 1);
    assert.equal(snap.shadowDecisions, 1);
    assert.equal(snap.shadowParityMismatch, 1);
    assert.equal(snap.leaseLost, 1);
    assert.equal(snap.released, 1);
    assert.equal(snap.errors, 1);
    assert.equal(snap.activeRooms, 3);
  });

  it("starts at zero", () => {
    const snap = new RoomLoopMetrics().snapshot(0);
    assert.deepEqual(snap, {
      claimed: 0,
      claimFailed: 0,
      released: 0,
      leaseLost: 0,
      cyclesRun: 0,
      drawsInserted: 0,
      backpressureSkips: 0,
      recoveries: 0,
      shadowDecisions: 0,
      shadowParityMismatch: 0,
      errors: 0,
      activeRooms: 0,
    });
  });
});
