import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rollTicketCount } from "./ticketRoll.js";

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

  it("uses uniform random across full 1..cap range", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(rollTicketCount(3, 3));
    }
    assert.ok(seen.has(1));
    assert.ok(seen.has(2));
    assert.ok(seen.has(3));
  });
});
