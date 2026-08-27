import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickDevPlayerForJoin } from "./selectDevPlayer.js";
import type { DevPlayerConfigSnapshot } from "./types.js";

const player = (userId: string): DevPlayerConfigSnapshot => ({
  userId,
  profiles: [{ playWindows: [{ start: "10:00", end: "22:00" }], allowedPrices: [1000] }],
});

describe("pickDevPlayerForJoin", () => {
  it("returns only players not in excluded set", () => {
    const candidates = [player("a"), player("b"), player("c")];
    const excluded = new Set(["a", "b"]);
    const picked = pickDevPlayerForJoin(candidates, excluded);
    assert.equal(picked?.userId, "c");
  });

  it("returns null when all candidates are excluded", () => {
    const candidates = [player("a"), player("b")];
    const excluded = new Set(["a", "b"]);
    assert.equal(pickDevPlayerForJoin(candidates, excluded), null);
  });
});
