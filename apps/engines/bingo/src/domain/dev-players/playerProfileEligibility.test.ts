import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPlayerEligibleForTemplate } from "./playerProfileEligibility.js";
import type { DevPlayerConfigSnapshot, RoomTemplateSnapshot } from "./types.js";

const template = (price: number): RoomTemplateSnapshot => ({
  id: "t1",
  name: "Room",
  price,
  vip: false,
  roomType: "normal",
  status: "active",
  maxCardsPerPlayer: 3,
  maxPlayers: null,
});

const player = (profiles: DevPlayerConfigSnapshot["profiles"]): DevPlayerConfigSnapshot => ({
  userId: "u1",
  profiles,
});

describe("isPlayerEligibleForTemplate", () => {
  it("accepts when one profile is in window and price is allowed", () => {
    const result = isPlayerEligibleForTemplate(
      player([
        {
          playWindows: [{ start: "10:00", end: "22:00" }],
          allowedPrices: [1000, 2000],
        },
        {
          playWindows: [{ start: "22:00", end: "23:59" }],
          allowedPrices: [5000],
        },
      ]),
      template(2000),
      { timezone: "Asia/Tehran" } as any,
      new Date("2026-08-27T12:00:00+03:30")
    );

    assert.equal(result.ok, true);
  });

  it("accepts when one of multiple windows in the same profile matches", () => {
    const result = isPlayerEligibleForTemplate(
      player([
        {
          playWindows: [
            { start: "08:00", end: "10:00" },
            { start: "14:00", end: "16:00" },
          ],
          allowedPrices: [1000],
        },
      ]),
      template(1000),
      { timezone: "Asia/Tehran" } as any,
      new Date("2026-08-27T15:00:00+03:30")
    );

    assert.equal(result.ok, true);
  });

  it("rejects when price belongs only to a profile outside the current window", () => {
    const result = isPlayerEligibleForTemplate(
      player([
        {
          playWindows: [{ start: "10:00", end: "12:00" }],
          allowedPrices: [1000],
        },
        {
          playWindows: [{ start: "20:00", end: "22:00" }],
          allowedPrices: [5000],
        },
      ]),
      template(5000),
      { timezone: "Asia/Tehran" } as any,
      new Date("2026-08-27T11:00:00+03:30")
    );

    assert.deepEqual(result, { ok: false, reason: "priceRange" });
  });

  it("accepts when multiple enabled profiles union prices and windows", () => {
    const result = isPlayerEligibleForTemplate(
      player([
        {
          playWindows: [{ start: "09:00", end: "12:00" }],
          allowedPrices: [1000],
        },
        {
          playWindows: [{ start: "18:00", end: "22:00" }],
          allowedPrices: [5000],
        },
      ]),
      template(5000),
      { timezone: "Asia/Tehran" } as any,
      new Date("2026-08-27T20:00:00+03:30")
    );

    assert.equal(result.ok, true);
  });

  it("rejects players without profiles", () => {
    const result = isPlayerEligibleForTemplate(
      player([]),
      template(1000),
      { timezone: "Asia/Tehran" } as any,
      new Date("2026-08-27T12:00:00+03:30")
    );

    assert.deepEqual(result, { ok: false, reason: "outsidePlayerWindow" });
  });
});
