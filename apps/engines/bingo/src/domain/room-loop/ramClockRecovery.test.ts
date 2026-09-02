import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickNextNumber } from "../../core/index.js";

describe("RAM clock crash recovery (seed continuity)", () => {
  it("pickNextNumber does not repeat numbers already in DB drawn set", () => {
    const seed = Buffer.alloc(32, 0xab);
    const dbDrawn = [12, 45, 67];
    const next = pickNextNumber(seed, dbDrawn);
    assert.ok(next != null);
    assert.ok(!dbDrawn.includes(next));
  });

  it("same seed + same drawn set yields deterministic next ball", () => {
    const seed = Buffer.alloc(32, 0xcd);
    const drawn = [3, 18, 22];
    const a = pickNextNumber(seed, drawn);
    const b = pickNextNumber(seed, drawn);
    assert.equal(a, b);
  });
});

describe("wallet currency filter contract", () => {
  it("documents IRR filter requirement for mixed-currency wallet sums", () => {
    const wallets = [
      { user_id: "u1", currency: "IRR", balance: 1000 },
      { user_id: "u1", currency: "USD", balance: 50 },
    ];
    const irrOnly = wallets.filter((w) => w.currency === "IRR");
    const mixedSum = wallets.reduce((s, w) => s + w.balance, 0);
    const irrSum = irrOnly.reduce((s, w) => s + w.balance, 0);
    assert.equal(mixedSum, 1050);
    assert.equal(irrSum, 1000);
    assert.notEqual(mixedSum, irrSum);
  });
});
