import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampRoomCreateStaggerSec,
  nextRoomCreateBudget,
  resolveRoomCreateStaggerSec,
  TOURNAMENT_ROOM_CREATE_STAGGER_SEC_MAX,
} from "./tournamentRoomStagger.js";

const seatedRound = {
  roundNo: 1,
  tableCount: 4,
  unseatedCount: 3,
  lastRoomCreatedAtMs: Date.parse("2026-08-31T10:00:00.000Z"),
};

describe("tournamentRoomStagger", () => {
  it("clamps invalid and oversized stagger to a safe range", () => {
    assert.equal(clampRoomCreateStaggerSec(-1), 0);
    assert.equal(clampRoomCreateStaggerSec(0), 0);
    assert.equal(clampRoomCreateStaggerSec(Number.NaN), 0);
    assert.equal(clampRoomCreateStaggerSec(3.9), 3);
    assert.equal(
      clampRoomCreateStaggerSec(TOURNAMENT_ROOM_CREATE_STAGGER_SEC_MAX + 50),
      TOURNAMENT_ROOM_CREATE_STAGGER_SEC_MAX
    );
  });

  it("prefers tournament meta over the engine default", () => {
    assert.equal(resolveRoomCreateStaggerSec(3, null), 3);
    assert.equal(resolveRoomCreateStaggerSec(3, {}), 3);
    assert.equal(
      resolveRoomCreateStaggerSec(3, { room_create_stagger_seconds: 5 }),
      5
    );
    assert.equal(
      resolveRoomCreateStaggerSec(3, { room_create_stagger_seconds: 0 }),
      0
    );
  });

  it("seats every table when stagger is off", () => {
    assert.equal(nextRoomCreateBudget(0, seatedRound, seatedRound.lastRoomCreatedAtMs!), null);
  });

  it("seats the first table immediately when the round does not exist yet", () => {
    assert.equal(
      nextRoomCreateBudget(
        3,
        { roundNo: 0, tableCount: 0, unseatedCount: 0, lastRoomCreatedAtMs: null },
        Date.parse("2026-08-31T10:00:00.000Z")
      ),
      1
    );
  });

  it("waits until stagger elapsed before seating the next room", () => {
    const last = seatedRound.lastRoomCreatedAtMs!;
    assert.equal(nextRoomCreateBudget(3, seatedRound, last + 2999), 0);
    assert.equal(nextRoomCreateBudget(3, seatedRound, last + 3000), 1);
  });

  it("does not seat when every table already has a room", () => {
    assert.equal(
      nextRoomCreateBudget(
        3,
        { ...seatedRound, unseatedCount: 0 },
        seatedRound.lastRoomCreatedAtMs! + 10_000
      ),
      0
    );
  });
});
