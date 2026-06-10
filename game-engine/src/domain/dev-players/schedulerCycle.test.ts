import { describe, expect, it } from "vitest";
import {
  advanceSchedulerCycle,
  canScheduleWorkCycleJoin,
  isJoinDue,
  isPauseCycleConfigured,
  rollJoinDelaySeconds,
  rollTicketCount,
} from "./schedulerCycle.js";
import type { DevPlayerSettingsSnapshot } from "./types.js";

const baseSettings: DevPlayerSettingsSnapshot = {
  systemEnabled: true,
  schedulerEnabled: true,
  schedulerTickIntervalSeconds: 60,
  schedulerPauseAfterSeconds: 300,
  schedulerPauseDurationSeconds: 120,
  timezone: "Asia/Tehran",
  activeJoinPresetId: "preset-1",
};

describe("schedulerCycle", () => {
  it("detects configured pause cycle", () => {
    expect(isPauseCycleConfigured(baseSettings)).toBe(true);
    expect(
      isPauseCycleConfigured({ ...baseSettings, schedulerPauseAfterSeconds: null })
    ).toBe(false);
  });

  it("starts in work phase with random duration", () => {
    const now = new Date("2026-06-09T10:00:00Z");
    const result = advanceSchedulerCycle(
      baseSettings,
      {
        cyclePhase: "work",
        cyclePhaseEndsAt: null,
        nextJoinAtByTemplate: {},
        joinsInWorkCycleByTemplate: { t1: 3 },
      },
      now
    );
    expect(result.inPause).toBe(false);
    expect(result.transitioned).toBe(true);
    expect(result.runtime.cyclePhase).toBe("work");
    expect(result.runtime.cyclePhaseEndsAt).not.toBeNull();
    expect(result.runtime.joinsInWorkCycleByTemplate).toEqual({});
  });

  it("caps joins per work cycle when pause cycle is configured", () => {
    expect(canScheduleWorkCycleJoin(true, 0, 10)).toBe(true);
    expect(canScheduleWorkCycleJoin(true, 9, 10)).toBe(true);
    expect(canScheduleWorkCycleJoin(true, 10, 10)).toBe(false);
    expect(canScheduleWorkCycleJoin(false, 99, 10)).toBe(true);
  });

  it("join delay stays within 5..interval", () => {
    for (let i = 0; i < 20; i += 1) {
      const delay = rollJoinDelaySeconds(30);
      expect(delay).toBeGreaterThanOrEqual(5);
      expect(delay).toBeLessThanOrEqual(30);
    }
  });

  it("ticket count stays within 1..maxTicketCount", () => {
    for (let i = 0; i < 20; i += 1) {
      const count = rollTicketCount(5);
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(5);
    }
    expect(rollTicketCount(1)).toBe(1);
  });

  it("ticket count respects template max_cards_per_player cap", () => {
    for (let i = 0; i < 20; i += 1) {
      const count = rollTicketCount(10, 3);
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it("respects per-template next join timestamp", () => {
    const now = new Date("2026-06-09T10:00:00Z");
    const future = new Date("2026-06-09T10:05:00Z").toISOString();
    expect(isJoinDue("t1", { t1: future }, now)).toBe(false);
    expect(isJoinDue("t1", {}, now)).toBe(true);
  });
});
