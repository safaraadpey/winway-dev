import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeJoinDelayMaxSeconds,
  rollJoinDelaySeconds,
  scheduledAtWithJoinDelay,
} from "./joinDelay.js";

describe("joinDelay", () => {
  it("normalizes invalid values to default", () => {
    assert.equal(normalizeJoinDelayMaxSeconds("abc"), 20);
    assert.equal(normalizeJoinDelayMaxSeconds(-5), 0);
    assert.equal(normalizeJoinDelayMaxSeconds(99999), 7200);
  });

  it("rolls delay within 0..max", () => {
    for (let i = 0; i < 50; i += 1) {
      const rolled = rollJoinDelaySeconds(30);
      assert.ok(rolled >= 0);
      assert.ok(rolled <= 30);
    }
  });

  it("scheduledAtWithJoinDelay is in the future or now", () => {
    const now = new Date("2026-08-27T12:00:00.000Z");
    const scheduledAt = scheduledAtWithJoinDelay(now, 10);
    const scheduledMs = new Date(scheduledAt).getTime();
    assert.ok(scheduledMs >= now.getTime());
    assert.ok(scheduledMs <= now.getTime() + 10_000);
  });
});
