import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rollNaturalDripTicketCount, rollTicketCount } from "./ticketRoll.js";

describe("ticketRoll", () => {
  it("ticket count stays within 1..maxTicketCount", () => {
    for (let i = 0; i < 20; i += 1) {
      const count = rollTicketCount(5);
      assert.ok(count >= 1);
      assert.ok(count <= 5);
    }
    assert.equal(rollTicketCount(1), 1);
  });

  it("ticket count respects template max_cards_per_player cap", () => {
    for (let i = 0; i < 20; i += 1) {
      const count = rollTicketCount(10, 3);
      assert.ok(count >= 1);
      assert.ok(count <= 3);
    }
  });

  it("natural drip returns 1 or 2 when template allows", () => {
    for (let i = 0; i < 30; i += 1) {
      const count = rollNaturalDripTicketCount(5, 5);
      assert.ok(count === 1 || count === 2);
    }
  });
});
