import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RoomRow } from "../../repositories/types.js";
import { stableRoomJitterMs } from "../room/drawScheduleJitter.js";
import {
  FIRST_DRAW_DELAY_SEC,
  cadenceDelayMs,
  drawIntervalSec,
  msUntilDue,
  nextDrawAtIso,
} from "./scheduleNextDraw.js";

function room(meta: Record<string, unknown> | null): RoomRow {
  return {
    id: "4ce92c20-f599-4c09-9f67-17e0fe19afde",
    status: "playing",
    currency: "usd",
    room_seed: null,
    room_template_id: null,
    next_draw_at: null,
    starts_at: null,
    min_players: 1,
    countdown_sec: 120,
    first_line_draw_number: null,
    line_reward_percentage: null,
    full_reward_percentage: null,
    ding_per_number: null,
    meta,
  };
}

describe("scheduleNextDraw", () => {
  it("first draw delay constant matches scheduler (7s)", () => {
    assert.equal(FIRST_DRAW_DELAY_SEC, 7);
  });

  it("drawIntervalSec reads meta, defaults to 1, floors at 1", () => {
    assert.equal(drawIntervalSec({ draw_interval_sec: 3 }), 3);
    assert.equal(drawIntervalSec({ draw_interval_sec: "5" }), 5);
    assert.equal(drawIntervalSec({}), 1);
    assert.equal(drawIntervalSec(null), 1);
    assert.equal(drawIntervalSec({ draw_interval_sec: 0 }), 1);
    assert.equal(drawIntervalSec({ draw_interval_sec: -4 }), 1);
  });

  it("nextDrawAtIso advances by interval + stable room jitter", () => {
    const r = room({ draw_interval_sec: 2 });
    const from = new Date("2026-06-13T06:00:00.000Z");
    const iso = nextDrawAtIso(r, from);
    const deltaMs = Date.parse(iso) - from.getTime();
    const stable = stableRoomJitterMs(r.id);
    // interval (2000) + stable jitter ± up to 100ms random
    assert.ok(Math.abs(deltaMs - (2000 + stable)) <= 100);
  });

  it("msUntilDue clamps to 0 for past/unset and is positive for future", () => {
    assert.equal(msUntilDue(null), 0);
    assert.equal(msUntilDue(new Date(Date.now() - 5000).toISOString()), 0);
    const future = msUntilDue(new Date(Date.now() + 1000).toISOString());
    assert.ok(future > 500 && future <= 1000);
  });

  it("cadenceDelayMs returns 0 when next draw is already due", () => {
    const past = new Date(Date.now() - 2000).toISOString();
    assert.equal(cadenceDelayMs(past), 0);
  });

  it("cadenceDelayMs waits until next_draw_at when still in the future", () => {
    const futureIso = new Date(Date.now() + 800).toISOString();
    const delay = cadenceDelayMs(futureIso);
    assert.ok(delay > 400 && delay <= 800);
  });
});
