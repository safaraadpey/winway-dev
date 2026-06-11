import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCardDefinitionMasks,
  hasFullWin,
  hasLineWin,
  maskCovers,
  maskFromMarkedValues,
  markBit,
} from "./masks.js";
import { assignBitPositions } from "./layout.js";

describe("bitmask masks", () => {
  const cells = [
    { value: 1, rowNo: 1, colNo: 1 },
    { value: 10, rowNo: 1, colNo: 3 },
    { value: 19, rowNo: 1, colNo: 5 },
    { value: 28, rowNo: 1, colNo: 7 },
    { value: 37, rowNo: 1, colNo: 9 },
    { value: 2, rowNo: 2, colNo: 2 },
    { value: 11, rowNo: 2, colNo: 4 },
    { value: 20, rowNo: 2, colNo: 6 },
    { value: 29, rowNo: 2, colNo: 8 },
    { value: 38, rowNo: 2, colNo: 9 },
    { value: 3, rowNo: 3, colNo: 1 },
    { value: 12, rowNo: 3, colNo: 3 },
    { value: 21, rowNo: 3, colNo: 5 },
    { value: 30, rowNo: 3, colNo: 7 },
    { value: 39, rowNo: 3, colNo: 9 },
  ];

  it("assigns bit positions 0-14 by row", () => {
    const positioned = assignBitPositions(cells);
    assert.equal(positioned.length, 15);
    assert.equal(positioned[0]!.bitPosition, 0);
    assert.equal(positioned[4]!.bitPosition, 4);
    assert.equal(positioned[5]!.bitPosition, 5);
    assert.equal(positioned[14]!.bitPosition, 14);
  });

  it("computes line and full masks", () => {
    const def = computeCardDefinitionMasks("c1", cells);
    assert.equal(def.cellCount, 15);
    assert.ok(maskCovers(def.fullMask, def.line1Mask));
    assert.ok(hasLineWin(def.line1Mask, def));
    assert.ok(hasLineWin(def.line2Mask, def));
    assert.ok(hasFullWin(def.fullMask, def));
    assert.equal(hasLineWin(0, def), false);
  });

  it("markBit and maskFromMarkedValues", () => {
    const positioned = assignBitPositions(cells);
    const valueToBit = new Map(positioned.map((c) => [c.value, c.bitPosition]));
    let mask = 0;
    mask = markBit(mask, 0);
    mask = markBit(mask, 4);
    assert.equal(maskFromMarkedValues(new Set([1, 37]), valueToBit), mask);
  });
});
