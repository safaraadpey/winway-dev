import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCallerFinalizeDraw,
  isLiveActorOwnedRoom,
  type RoomLeaseSnapshot,
} from "./finalizeOwnership.js";

const NOW = Date.parse("2026-06-13T12:00:00.000Z");
const FUTURE = "2026-06-13T12:05:00.000Z";
const PAST = "2026-06-13T11:55:00.000Z";

function liveRoom(
  overrides: Partial<RoomLeaseSnapshot> = {}
): RoomLeaseSnapshot {
  return {
    status: "playing",
    engine_owner_id: "engine-a",
    engine_lease_until: FUTURE,
    engine_lease_epoch: 3,
    ...overrides,
  };
}

describe("isLiveActorOwnedRoom", () => {
  it("true when playing with active lease", () => {
    assert.equal(isLiveActorOwnedRoom(liveRoom(), NOW), true);
  });

  it("false when not playing", () => {
    assert.equal(
      isLiveActorOwnedRoom(liveRoom({ status: "finished" }), NOW),
      false
    );
  });

  it("false when lease expired", () => {
    assert.equal(
      isLiveActorOwnedRoom(liveRoom({ engine_lease_until: PAST }), NOW),
      false
    );
  });

  it("false when owner or lease_until missing", () => {
    assert.equal(
      isLiveActorOwnedRoom(liveRoom({ engine_owner_id: null }), NOW),
      false
    );
    assert.equal(
      isLiveActorOwnedRoom(liveRoom({ engine_lease_until: null }), NOW),
      false
    );
  });
});

describe("canCallerFinalizeDraw", () => {
  it("allows matching fence on live-owned room", () => {
    assert.equal(
      canCallerFinalizeDraw(liveRoom(), { ownerId: "engine-a", leaseEpoch: 3 }, NOW),
      true
    );
  });

  it("denies missing fence on live-owned room (draw-processor path)", () => {
    assert.equal(canCallerFinalizeDraw(liveRoom(), null, NOW), false);
    assert.equal(canCallerFinalizeDraw(liveRoom(), undefined, NOW), false);
  });

  it("denies stale or wrong owner on live-owned room", () => {
    assert.equal(
      canCallerFinalizeDraw(
        liveRoom(),
        { ownerId: "engine-b", leaseEpoch: 3 },
        NOW
      ),
      false
    );
    assert.equal(
      canCallerFinalizeDraw(
        liveRoom(),
        { ownerId: "engine-a", leaseEpoch: 99 },
        NOW
      ),
      false
    );
  });

  it("allows processor finalize when lease expired (unowned recovery)", () => {
    assert.equal(
      canCallerFinalizeDraw(
        liveRoom({ engine_lease_until: PAST }),
        null,
        NOW
      ),
      true
    );
  });

  it("allows processor finalize for finished room", () => {
    assert.equal(
      canCallerFinalizeDraw(
        liveRoom({ status: "finished", engine_lease_until: FUTURE }),
        null,
        NOW
      ),
      true
    );
  });
});
