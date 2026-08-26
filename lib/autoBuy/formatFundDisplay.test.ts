/**
 * Auto-buy P&L display: in-play card cost is not a realized loss.
 * Run: node --import tsx --test lib/autoBuy/formatFundDisplay.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAutoBuyFundDisplay,
  resolveAutoBuyInPlayCost,
} from "./formatFundDisplay";

describe("formatAutoBuyFundDisplay", () => {
  it("does not treat in-play card spend as a loss", () => {
    const display = formatAutoBuyFundDisplay(100_000, 90_000, 10_000);
    assert.deepEqual(display, { value: "+0", tone: "gain" });
  });

  it("shows realized loss after a settled losing round", () => {
    const display = formatAutoBuyFundDisplay(100_000, 90_000, 0);
    assert.deepEqual(display, { value: "-10,000", tone: "loss" });
  });

  it("keeps realized loss while the next round's cards are in play", () => {
    const display = formatAutoBuyFundDisplay(100_000, 80_000, 10_000);
    assert.deepEqual(display, { value: "-10,000", tone: "loss" });
  });

  it("shows net profit after a win (prize minus settled card cost)", () => {
    const display = formatAutoBuyFundDisplay(100_000, 140_000, 0);
    assert.deepEqual(display, { value: "+40,000", tone: "gain" });
  });
});

describe("resolveAutoBuyInPlayCost", () => {
  it("prefers the snapshot in-play cost", () => {
    assert.equal(
      resolveAutoBuyInPlayCost({
        inPlayCost: 20_000,
        hasReservedCards: true,
        lastRoomId: "room-1",
        price: 10_000,
        cardCount: 1,
      }),
      20_000
    );
  });

  it("falls back to current-room cards after auto-buy has joined", () => {
    assert.equal(
      resolveAutoBuyInPlayCost({
        hasReservedCards: true,
        lastRoomId: "room-1",
        price: 10_000,
        cardCount: 1,
      }),
      10_000
    );
  });

  it("does not count skip-first-join cards as auto-buy capital", () => {
    assert.equal(
      resolveAutoBuyInPlayCost({
        hasReservedCards: true,
        lastRoomId: null,
        price: 10_000,
        cardCount: 1,
      }),
      0
    );
  });
});
