import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addSecondsWithJitter,
  drawScheduleJitterMs,
  stableRoomJitterMs,
} from "./drawScheduleJitter.js";

describe("drawScheduleJitter", () => {
  it("stable jitter is deterministic per room", () => {
    const roomId = "cea06856-f691-4b68-b64d-4535a25c628e";
    const a = stableRoomJitterMs(roomId);
    const b = stableRoomJitterMs(roomId);
    assert.equal(a, b);
    assert.ok(a >= -300 && a <= 300);
  });

  it("different rooms get different stable offsets", () => {
    const a = stableRoomJitterMs("cea06856-f691-4b68-b64d-4535a25c628e");
    const b = stableRoomJitterMs("4cc29e29-3bcd-4003-a4f8-3bad03c39d8b");
    assert.notEqual(a, b);
  });

  it("addSecondsWithJitter applies stable + random components", () => {
    const base = new Date("2026-06-13T06:00:00.000Z");
    const roomId = "4ce92c20-f599-4c09-9f67-17e0fe19afde";
    const iso = addSecondsWithJitter(base, 3, roomId, () => 0.5);
    const ms = Date.parse(iso) - base.getTime();
    assert.equal(ms, 3000 + stableRoomJitterMs(roomId));
  });

  it("drawScheduleJitterMs uses random in expected range", () => {
    const jitter = drawScheduleJitterMs("room-a", () => 0);
    assert.equal(jitter, stableRoomJitterMs("room-a") - 100);
  });
});
