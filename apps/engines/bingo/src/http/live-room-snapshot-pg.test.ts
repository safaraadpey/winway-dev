import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameManifest } from "../domain/replay/types.js";
import {
  deriveCommissionRateFromManifest,
  normalizeFrozenPrizeSplits,
} from "./live-room-snapshot-pg.js";

function makeManifest(overrides: Partial<GameManifest> = {}): GameManifest {
  return {
    roomId: "room-1",
    roomSeedHex: "a".repeat(64),
    roomSeedHash: "b".repeat(64),
    rngAlgorithm: "SHA256_ORDERING",
    rngVersion: "v1",
    manifestVersion: 1,
    poolId: "1",
    poolCommitHash: "hash",
    poolPrngVersion: "v1",
    dingPerNumber: 1,
    lineRewardPercentage: 0.5,
    fullRewardPercentage: 0.5,
    dingSettleMode: "room_level",
    currency: "IRR",
    cardPrice: 100_000,
    commissionPool: 360_000,
    commissions: [
      { ticketId: "t1", amountToPool: 90_000 },
      { ticketId: "t2", amountToPool: 90_000 },
    ],
    tickets: [
      {
        ticketId: "t1",
        userId: "u1",
        poolCardId: "1",
        cardNo: 1,
        price: 100_000,
        gridFingerprint: "fp1",
      },
      {
        ticketId: "t2",
        userId: "u2",
        poolCardId: "2",
        cardNo: 2,
        price: 100_000,
        gridFingerprint: "fp2",
      },
    ],
    ...overrides,
  };
}

test("deriveCommissionRateFromManifest inverts ceil(gross * rate)", () => {
  const manifest = makeManifest();
  const rate = deriveCommissionRateFromManifest(manifest);
  assert.equal(Math.ceil(100_000 * rate), 10_000);
});

test("normalizeFrozenPrizeSplits rebalances over-100 splits", () => {
  const out = normalizeFrozenPrizeSplits(0.6, 0.6);
  assert.ok(Math.abs(out.lineRewardPercentage + out.fullRewardPercentage - 1) < 1e-9);
  assert.equal(out.lineRewardPercentage, 0.5);
});
