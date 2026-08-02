import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidFence } from "./leaseFence.js";
import {
  roleRequiresRedisLock,
  shouldFailClosedWithoutRedis,
} from "./rolePolicy.js";

describe("leaseFence.isValidFence", () => {
  it("accepts positive epoch and owner", () => {
    assert.equal(isValidFence({ ownerId: "a:1", leaseEpoch: 2 }), true);
  });

  it("rejects missing epoch", () => {
    assert.equal(isValidFence({ ownerId: "a", leaseEpoch: 0 }), false);
  });
});

describe("rolePolicy", () => {
  it("marks global workers as redis-lock roles", () => {
    assert.equal(roleRequiresRedisLock("scheduler"), true);
    assert.equal(roleRequiresRedisLock("room-loop"), false);
  });

  it("fail-closed when strict or multi-replica", () => {
    assert.equal(
      shouldFailClosedWithoutRedis({
        coordinationStrict: false,
        engineReplicaCount: 2,
      }),
      true
    );
    assert.equal(
      shouldFailClosedWithoutRedis({
        coordinationStrict: true,
        engineReplicaCount: 1,
      }),
      true
    );
  });
});
