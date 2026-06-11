import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRegistryFromCardNumbers } from "../core/card-registry/build.js";
import { validateDualModeParity } from "./dual-mode-validator.js";

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
  { pool_card_id: "c2", value: 1, row_no: 1, col_no: 1 },
  { pool_card_id: "c2", value: 10, row_no: 1, col_no: 3 },
  { pool_card_id: "c2", value: 19, row_no: 1, col_no: 5 },
  { pool_card_id: "c2", value: 28, row_no: 1, col_no: 7 },
  { pool_card_id: "c2", value: 37, row_no: 1, col_no: 9 },
  { pool_card_id: "c2", value: 2, row_no: 2, col_no: 2 },
  { pool_card_id: "c2", value: 11, row_no: 2, col_no: 4 },
  { pool_card_id: "c2", value: 20, row_no: 2, col_no: 6 },
  { pool_card_id: "c2", value: 29, row_no: 2, col_no: 8 },
  { pool_card_id: "c2", value: 38, row_no: 2, col_no: 9 },
  { pool_card_id: "c2", value: 3, row_no: 3, col_no: 1 },
  { pool_card_id: "c2", value: 12, row_no: 3, col_no: 3 },
  { pool_card_id: "c2", value: 21, row_no: 3, col_no: 5 },
  { pool_card_id: "c2", value: 30, row_no: 3, col_no: 7 },
  { pool_card_id: "c2", value: 39, row_no: 3, col_no: 9 },
];

const registry = buildRegistryFromCardNumbers(cells);
const def1 = registry.definitions.get("c1")!;
const def2 = registry.definitions.get("c2")!;

const baseContext = {
  roomId: "room-1",
  drawNumber: 37,
  drawSequence: [1, 10, 19, 28, 37],
  drawsProcessed: 4,
  wasReconciled: false,
  hasUnprocessedDraw: false,
  firstLineDrawNumber: null,
  ticketCount: 2,
};

describe("validateDualModeParity", () => {
  it("passes when scan and bitmask agree (line win)", () => {
    const result = validateDualModeParity({
      context: baseContext,
      scan: {
        markRows: [
          { ticket_id: "t1", value: 37 },
          { ticket_id: "t2", value: 37 },
        ],
        evalOut: {
          newResults: [
            { ticketId: "t1", userId: "u1", winType: "line" },
            { ticketId: "t2", userId: "u2", winType: "line" },
          ],
          setFirstLineDrawNumber: true,
          fullWinnerThisDraw: false,
        },
        markedByTicket: new Map([
          ["t1", new Set([1, 10, 19, 28, 37])],
          ["t2", new Set([1, 10, 19, 28, 37])],
        ]),
      },
      bitmask: {
        markRows: [
          { ticket_id: "t1", value: 37 },
          { ticket_id: "t2", value: 37 },
        ],
        evalOut: {
          newResults: [
            { ticketId: "t1", userId: "u1", winType: "line" },
            { ticketId: "t2", userId: "u2", winType: "line" },
          ],
          setFirstLineDrawNumber: true,
          fullWinnerThisDraw: false,
        },
        maskByTicket: new Map([
          ["t1", def1.line1Mask],
          ["t2", def2.line1Mask],
        ]),
      },
      ticketCardId: new Map([
        ["t1", "c1"],
        ["t2", "c2"],
      ]),
      registry,
    });
    assert.equal(result.parity, true);
    assert.equal(result.mismatches.length, 0);
  });

  it("detects line win mismatch (multiple winners edge case)", () => {
    const result = validateDualModeParity({
      context: baseContext,
      scan: {
        markRows: [{ ticket_id: "t1", value: 37 }],
        evalOut: {
          newResults: [
            { ticketId: "t1", userId: "u1", winType: "line" },
            { ticketId: "t2", userId: "u2", winType: "line" },
          ],
          setFirstLineDrawNumber: true,
          fullWinnerThisDraw: false,
        },
        markedByTicket: new Map([["t1", new Set([1, 10, 19, 28, 37])]]),
      },
      bitmask: {
        markRows: [{ ticket_id: "t1", value: 37 }],
        evalOut: {
          newResults: [{ ticketId: "t1", userId: "u1", winType: "line" }],
          setFirstLineDrawNumber: true,
          fullWinnerThisDraw: false,
        },
        maskByTicket: new Map([["t1", def1.line1Mask]]),
      },
      ticketCardId: new Map([
        ["t1", "c1"],
        ["t2", "c2"],
      ]),
      registry,
    });
    assert.equal(result.parity, false);
    assert.ok(result.mismatches.some((m) => m.kind === "line_wins"));
  });

  it("detects full house mismatch", () => {
    const result = validateDualModeParity({
      context: { ...baseContext, drawNumber: 39 },
      scan: {
        markRows: [{ ticket_id: "t1", value: 39 }],
        evalOut: {
          newResults: [{ ticketId: "t1", userId: "u1", winType: "full" }],
          setFirstLineDrawNumber: false,
          fullWinnerThisDraw: true,
        },
        markedByTicket: new Map([["t1", new Set(cells.filter((c) => c.pool_card_id === "c1").map((c) => c.value))]]),
      },
      bitmask: {
        markRows: [{ ticket_id: "t1", value: 39 }],
        evalOut: {
          newResults: [],
          setFirstLineDrawNumber: false,
          fullWinnerThisDraw: false,
        },
        maskByTicket: new Map([["t1", def1.fullMask & ~ (1 << 14)]]),
      },
      ticketCardId: new Map([["t1", "c1"]]),
      registry,
    });
    assert.equal(result.parity, false);
    assert.ok(result.mismatches.some((m) => m.kind === "full_wins"));
    assert.ok(result.mismatches.some((m) => m.kind === "full_winner_flag"));
  });

  it("detects mask diff with cardId context", () => {
    const result = validateDualModeParity({
      context: { ...baseContext, wasReconciled: true },
      scan: {
        markRows: [{ ticket_id: "t1", value: 37 }],
        evalOut: {
          newResults: [],
          setFirstLineDrawNumber: false,
          fullWinnerThisDraw: false,
        },
        markedByTicket: new Map([["t1", new Set([37])]]),
      },
      bitmask: {
        markRows: [{ ticket_id: "t1", value: 37 }],
        evalOut: {
          newResults: [],
          setFirstLineDrawNumber: false,
          fullWinnerThisDraw: false,
        },
        maskByTicket: new Map([["t1", 0]]),
      },
      ticketCardId: new Map([["t1", "c1"]]),
      registry,
    });
    assert.equal(result.parity, false);
    const maskMismatch = result.mismatches.find((m) => m.kind === "mask_diff");
    assert.ok(maskMismatch);
    assert.equal(maskMismatch!.maskDiffs![0]!.cardId, "c1");
    assert.equal(maskMismatch!.maskDiffs![0]!.ticketId, "t1");
  });
});
