import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEO_BAND_SHUFFLE_INTERVAL_MS,
  pickCappedUserIds,
  resolveBandRoster,
} from "./bandRoster.js";

const IDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];

describe("bandRoster", () => {
  it("caps without shuffle using stable sorted ids", () => {
    const picked = pickCappedUserIds(["c", "a", "b", "d"], 2, [], false);
    assert.deepEqual(picked, ["a", "b"]);
  });

  it("returns all eligible when cap is 0", () => {
    const picked = pickCappedUserIds(["b", "a"], 0, [], true);
    assert.deepEqual(picked, ["a", "b"]);
  });

  it("keeps existing roster until shuffle interval elapses", () => {
    const now = 1_000_000;
    const result = resolveBandRoster({
      eligibleUserIds: IDS,
      maxActivePlayers: 3,
      shuffleEnabled: true,
      existing: {
        selectedUserIds: ["a", "b", "c"],
        selectedAtMs: now - 10_000,
        shuffleGeneration: 0,
      },
      nowMs: now,
    });
    assert.equal(result.changed, false);
    assert.deepEqual(result.roster.selectedUserIds, ["a", "b", "c"]);
    assert.equal(result.roster.shuffleGeneration, 0);
  });

  it("reshuffles after 90 minutes and prefers players not on the previous roster", () => {
    const now = LEO_BAND_SHUFFLE_INTERVAL_MS + 5;
    const result = resolveBandRoster(
      {
        eligibleUserIds: IDS,
        maxActivePlayers: 3,
        shuffleEnabled: true,
        existing: {
          selectedUserIds: ["a", "b", "c"],
          selectedAtMs: 0,
          shuffleGeneration: 0,
        },
        nowMs: now,
      },
      () => 0
    );
    assert.equal(result.changed, true);
    assert.equal(result.roster.shuffleGeneration, 1);
    assert.equal(result.roster.selectedUserIds.length, 3);
    for (const id of result.roster.selectedUserIds) {
      assert.equal(["a", "b", "c"].includes(id), false);
    }
    assert.deepEqual(result.droppedUserIds, ["a", "b", "c"]);
  });

  it("drops users who are no longer eligible", () => {
    const result = resolveBandRoster({
      eligibleUserIds: ["a", "d"],
      maxActivePlayers: 3,
      shuffleEnabled: false,
      existing: {
        selectedUserIds: ["a", "b", "c"],
        selectedAtMs: 1,
        shuffleGeneration: 0,
      },
      nowMs: 2,
    });
    assert.equal(result.droppedUserIds.includes("b"), true);
    assert.equal(result.droppedUserIds.includes("c"), true);
    assert.ok(result.roster.selectedUserIds.includes("a"));
    assert.ok(result.roster.selectedUserIds.includes("d"));
    assert.equal(result.roster.selectedUserIds.length, 2);
  });
});
