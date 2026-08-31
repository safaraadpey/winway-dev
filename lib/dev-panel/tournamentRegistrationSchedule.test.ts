/**
 * Tournament registration schedule engine tests.
 * Run: node --import tsx --test lib/dev-panel/tournamentRegistrationSchedule.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_FALLBACK_WINDOW_HOURS,
  HOURLY_CIRCADIAN,
  computeHourlyWeights,
  formatScheduleWindowDuration,
  generateRegistrationSchedule,
  getTehranHour,
  resolveScheduleWindow,
} from "./tournamentRegistrationSchedule";

describe("getTehranHour", () => {
  it("returns a value between 0 and 23", () => {
    const hour = getTehranHour(new Date("2026-08-30T12:00:00.000Z"));
    assert.ok(hour >= 0 && hour <= 23);
  });
});

describe("resolveScheduleWindow", () => {
  const open = new Date("2026-08-30T06:00:00.000Z");

  it("spans until tournament start for multi-day cycles", () => {
    const startAt = new Date("2026-09-02T06:00:00.000Z");
    const window = resolveScheduleWindow(open, startAt);
    assert.equal(window.windowHours, 72);
    assert.equal(window.windowEnd.getTime(), startAt.getTime());
  });

  it("falls back to 24h when start_at is missing", () => {
    const window = resolveScheduleWindow(open, null);
    assert.equal(window.windowHours, DEFAULT_FALLBACK_WINDOW_HOURS);
  });
});

describe("formatScheduleWindowDuration", () => {
  it("formats multi-day windows in Persian units", () => {
    assert.equal(formatScheduleWindowDuration(72 * 60 * 60 * 1000), "3 روز");
    assert.equal(formatScheduleWindowDuration(50 * 60 * 60 * 1000), "2 روز و 2 ساعت");
  });
});

describe("computeHourlyWeights", () => {
  it("produces one bucket per hour in the window", () => {
    const open = new Date("2026-08-30T06:00:00.000Z");
    const weights = computeHourlyWeights(open, 48);
    assert.equal(weights.length, 48);
  });

  it("decays over time while respecting circadian shape", () => {
    const open = new Date("2026-08-30T06:00:00.000Z");
    const weights = computeHourlyWeights(open, 24);
    assert.ok(weights[0]!.weight >= weights[12]!.weight * 0.5);
  });

  it("uses circadian table for every hour slot", () => {
    for (let h = 0; h < 24; h += 1) {
      assert.ok(HOURLY_CIRCADIAN[h] !== undefined);
    }
  });
});

describe("generateRegistrationSchedule", () => {
  const open = new Date("2026-08-30T06:00:00.000Z");
  const startAt = new Date("2026-08-31T06:00:00.000Z");

  it("returns one timestamp per player, sorted ascending", () => {
    let i = 0;
    const random = () => {
      i += 1;
      return (i % 97) / 97;
    };

    const playerIds = ["p1", "p2", "p3", "p4", "p5"];
    const items = generateRegistrationSchedule({
      registrationOpenTime: open,
      playerIds,
      tournamentStartAt: startAt,
      random,
    });

    assert.equal(items.length, playerIds.length);
    for (let j = 1; j < items.length; j += 1) {
      assert.ok(items[j]!.scheduledAt.getTime() >= items[j - 1]!.scheduledAt.getTime());
    }
  });

  it("clamps timestamps to registration window before tournament start", () => {
    const tightStart = new Date(open.getTime() + 2 * 60 * 60 * 1000);
    const items = generateRegistrationSchedule({
      registrationOpenTime: open,
      playerIds: ["a", "b", "c"],
      tournamentStartAt: tightStart,
      random: () => 0.99,
    });

    for (const item of items) {
      assert.ok(item.scheduledAt.getTime() >= open.getTime());
      assert.ok(item.scheduledAt.getTime() < tightStart.getTime());
    }
  });

  it("can spread registrations across a 3-day window", () => {
    const farStart = new Date(open.getTime() + 3 * 24 * 60 * 60 * 1000);
    const items = generateRegistrationSchedule({
      registrationOpenTime: open,
      playerIds: Array.from({ length: 30 }, (_, idx) => `p${idx}`),
      tournamentStartAt: farStart,
      random: () => Math.random(),
    });

    const last = items[items.length - 1]!.scheduledAt.getTime();
    assert.ok(last > open.getTime() + 24 * 60 * 60 * 1000);
    assert.ok(last < farStart.getTime());
  });

  it("returns empty list when no players", () => {
    const items = generateRegistrationSchedule({
      registrationOpenTime: open,
      playerIds: [],
    });
    assert.deepEqual(items, []);
  });
});
