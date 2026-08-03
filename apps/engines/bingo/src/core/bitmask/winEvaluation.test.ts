import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRegistryFromCardNumbers } from "../card-registry/build.js";
import { evaluateRoomAfterDrawBitmask } from "./winEvaluation.js";

describe("evaluateRoomAfterDrawBitmask", () => {
  const cells = [
    { pool_card_id: "c1", value: 1, row_no: 1, col_no: 1 },
    { pool_card_id: "c1", value: 10, row_no: 1, col_no: 3 },
    { pool_card_id: "c1", value: 19, row_no: 1, col_no: 5 },
    { pool_card_id: "c1", value: 28, row_no: 1, col_no: 7 },
    { pool_card_id: "c1", value: 37, row_no: 1, col_no: 9 },
    { pool_card_id: "c1", value: 2, row_no: 2, col_no: 2 },
    { pool_card_id: "c1", value: 11, row_no: 2, col_no: 4 },
    { pool_card_id: "c1", value: 20, row_no: 2, col_no: 6 },
    { pool_card_id: "c1", value: 29, row_no: 2, col_no: 8 },
    { pool_card_id: "c1", value: 38, row_no: 2, col_no: 9 },
    { pool_card_id: "c1", value: 3, row_no: 3, col_no: 1 },
    { pool_card_id: "c1", value: 12, row_no: 3, col_no: 3 },
    { pool_card_id: "c1", value: 21, row_no: 3, col_no: 5 },
    { pool_card_id: "c1", value: 30, row_no: 3, col_no: 7 },
    { pool_card_id: "c1", value: 39, row_no: 3, col_no: 9 },
  ];
  const registry = buildRegistryFromCardNumbers(cells);
  const def = registry.definitions.get("c1")!;

  it("detects line and full wins", () => {
    const bitmaskLine = evaluateRoomAfterDrawBitmask({
      drawNumber: 5,
      firstLineDrawNumber: null,
      maskByTicket: new Map([["t1", def.line1Mask]]),
      ticketCardId: new Map([["t1", "c1"]]),
      ticketUserId: new Map([["t1", "u1"]]),
      cardDefs: registry.definitions,
      affectedTicketIds: new Set(["t1"]),
    });

    assert.equal(bitmaskLine.newResults.length, 1);
    assert.equal(bitmaskLine.newResults[0]!.winType, "line");

    const bitmaskFull = evaluateRoomAfterDrawBitmask({
      drawNumber: 90,
      firstLineDrawNumber: 5,
      maskByTicket: new Map([["t1", def.fullMask]]),
      ticketCardId: new Map([["t1", "c1"]]),
      ticketUserId: new Map([["t1", "u1"]]),
      cardDefs: registry.definitions,
      existingLineTickets: new Set(["t1"]),
      affectedTicketIds: new Set(["t1"]),
    });

    assert.equal(bitmaskFull.newResults.length, 1);
    assert.equal(bitmaskFull.newResults[0]!.winType, "full");
  });

  it("evaluates all tickets when draw does not mark a winning card", () => {
    const bitmaskLine = evaluateRoomAfterDrawBitmask({
      drawNumber: 99,
      firstLineDrawNumber: null,
      maskByTicket: new Map([["t1", def.line1Mask]]),
      ticketCardId: new Map([["t1", "c1"]]),
      ticketUserId: new Map([["t1", "u1"]]),
      cardDefs: registry.definitions,
    });

    assert.equal(bitmaskLine.newResults.length, 1);
    assert.equal(bitmaskLine.newResults[0]!.winType, "line");
  });
});
