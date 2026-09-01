import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterTemplateIdsByStakeTiers,
  stakeTierFromPrice,
  stakeTiersForTemplateIds,
} from "./stakeTiers";

describe("stakeTiers", () => {
  it("matches the editor light / medium / heavy price cuts", () => {
    assert.equal(stakeTierFromPrice(0), "light");
    assert.equal(stakeTierFromPrice(49_999), "light");
    assert.equal(stakeTierFromPrice(50_000), "medium");
    assert.equal(stakeTierFromPrice(199_999), "medium");
    assert.equal(stakeTierFromPrice(200_000), "heavy");
  });

  it("filters template ids to allowed stake tiers", () => {
    const prices = new Map([
      ["light-a", 10_000],
      ["mid-a", 80_000],
      ["heavy-a", 250_000],
    ]);
    assert.deepEqual(
      filterTemplateIdsByStakeTiers(["light-a", "mid-a", "heavy-a"], new Set(["light", "heavy"]), prices),
      ["light-a", "heavy-a"]
    );
  });

  it("collects stake tiers present in a pool", () => {
    const prices = new Map([
      ["a", 10_000],
      ["b", 80_000],
    ]);
    const tiers = stakeTiersForTemplateIds(["a", "b", "missing"], prices);
    assert.deepEqual([...tiers].sort(), ["light", "medium"]);
  });
});
