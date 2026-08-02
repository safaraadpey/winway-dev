import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRenew } from "./roomLease.js";

describe("roomLease.shouldRenew", () => {
  it("renews once half the lease has elapsed", () => {
    const lease = 30;
    const now = 1_000_000;
    // 14s elapsed: not yet half of 30s.
    assert.equal(shouldRenew(now - 14_000, lease, now), false);
    // exactly half (15s).
    assert.equal(shouldRenew(now - 15_000, lease, now), true);
    // well past half.
    assert.equal(shouldRenew(now - 29_000, lease, now), true);
  });

  it("never renews immediately after a fresh renew", () => {
    const now = 2_000_000;
    assert.equal(shouldRenew(now, 30, now), false);
  });
});
