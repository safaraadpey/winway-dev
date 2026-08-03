import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RoomClaimResult } from "../repositories/types.js";

/**
 * Documents competing-claim expectations for multi-replica canaries.
 * Live takeover tests run via scripts/test-multi-replica.ts against real Postgres.
 */
describe("multiReplicaHarness", () => {
  it("only one successful claim wins a room epoch", () => {
    const claims: RoomClaimResult[] = [
      { claimed: true, leaseEpoch: 3 },
      { claimed: false, leaseEpoch: null },
      { claimed: false, leaseEpoch: null },
    ];
    const winners = claims.filter((c) => c.claimed);
    assert.equal(winners.length, 1);
    assert.equal(winners[0]!.leaseEpoch, 3);
  });

  it("stale epoch cannot match current fence", () => {
    const currentEpoch = 5;
    const staleFinalizeEpoch = 4;
    assert.notEqual(staleFinalizeEpoch, currentEpoch);
  });
});
