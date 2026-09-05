import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  diffManifestRamReplay,
  persistedFromReplay,
} from "./compareManifestRamAudit.js";
import { diffReplayAgainstPersisted } from "./compareReplay.js";
import { buildManifestRamAuditFinalization } from "./manifestRamAuditSim.js";
import { replayGame } from "./replayGame.js";
import type { GameManifest } from "./types.js";
import { RNG_ALGORITHM, RNG_VERSION } from "./types.js";

const CARD_CELLS = [
  { pool_card_id: "c1", value: 7, row_no: 1, col_no: 1 },
  { pool_card_id: "c1", value: 10, row_no: 1, col_no: 3 },
  { pool_card_id: "c1", value: 19, row_no: 1, col_no: 5 },
  { pool_card_id: "c1", value: 28, row_no: 1, col_no: 7 },
  { pool_card_id: "c1", value: 37, row_no: 1, col_no: 9 },
  { pool_card_id: "c1", value: 14, row_no: 2, col_no: 2 },
  { pool_card_id: "c1", value: 11, row_no: 2, col_no: 4 },
  { pool_card_id: "c1", value: 20, row_no: 2, col_no: 6 },
  { pool_card_id: "c1", value: 29, row_no: 2, col_no: 8 },
  { pool_card_id: "c1", value: 38, row_no: 2, col_no: 9 },
  { pool_card_id: "c1", value: 21, row_no: 3, col_no: 1 },
  { pool_card_id: "c1", value: 12, row_no: 3, col_no: 3 },
  { pool_card_id: "c1", value: 30, row_no: 3, col_no: 5 },
  { pool_card_id: "c1", value: 39, row_no: 3, col_no: 7 },
  { pool_card_id: "c1", value: 40, row_no: 3, col_no: 9 },
];

function gridFingerprint(): string {
  const parts = [...CARD_CELLS]
    .sort((a, b) => a.row_no - b.row_no || a.col_no - b.col_no || a.value - b.value)
    .map((r) => `${r.row_no}:${r.col_no}:${r.value}`);
  return createHash("sha256").update(parts.join(",")).digest("hex");
}

function makeManifest(): GameManifest {
  const seed = Buffer.from("11".repeat(32), "hex");
  const hash = createHash("sha256").update(seed).digest("hex");
  return {
    roomId: "11111111-1111-1111-1111-111111111111",
    roomSeedHex: seed.toString("hex"),
    roomSeedHash: hash,
    rngAlgorithm: RNG_ALGORITHM,
    rngVersion: RNG_VERSION,
    manifestVersion: 1,
    poolId: "22222222-2222-2222-2222-222222222222",
    poolCommitHash: "deadbeef",
    poolPrngVersion: "v1",
    dingPerNumber: 1,
    lineRewardPercentage: 0.1,
    fullRewardPercentage: 0.9,
    dingSettleMode: "room_level",
    currency: "IRR",
    cardPrice: 20000,
    commissionPool: 18000,
    commissions: [{ ticketId: "t1", amountToPool: 18000 }],
    tickets: [
      {
        ticketId: "t1",
        userId: "u1",
        poolCardId: "c1",
        cardNo: 1,
        price: 20000,
        gridFingerprint: gridFingerprint(),
      },
    ],
  };
}

describe("manifest_ram audit alignment", () => {
  it("MATCH for clean bulk history with checksum and zero unexpected writes", () => {
    const replay = replayGame({ manifest: makeManifest(), cardNumbers: CARD_CELLS });
    const persisted = persistedFromReplay(replay);
    const { finalization } = buildManifestRamAuditFinalization(makeManifest(), CARD_CELLS);

    const diff = diffManifestRamReplay(replay, persisted, {
      storedFinalizationSha256: finalization.resultSha256,
      auditFinalizationSha256: finalization.resultSha256,
      unexpectedPerDrawWrites: 0,
    });

    assert.equal(diff.outcome, "MATCH");
    assert.equal(diff.drawDiffCount, 0);
    assert.equal(diff.unexpectedPerDrawWrites, 0);
    assert.equal(diff.finalizationChecksumMismatch, false);
  });

  it("MATCH when bulk history set matches replay (DB insert order irrelevant)", () => {
    const manifest = makeManifest();
    const replay = replayGame({ manifest, cardNumbers: CARD_CELLS });
    const persisted = persistedFromReplay(replay);
    persisted.drawSequence = [...persisted.drawSequence].sort((a, b) => a - b);
    const { finalization } = buildManifestRamAuditFinalization(manifest, CARD_CELLS);

    const diff = diffManifestRamReplay(replay, persisted, {
      storedFinalizationSha256: finalization.resultSha256,
      auditFinalizationSha256: finalization.resultSha256,
      unexpectedPerDrawWrites: 0,
    });
    assert.equal(diff.outcome, "MATCH");
  });

  it("MISMATCH when unexpected pre-finalization writes > 0", () => {
    const replay = replayGame({ manifest: makeManifest(), cardNumbers: CARD_CELLS });
    const persisted = persistedFromReplay(replay);
    const { finalization } = buildManifestRamAuditFinalization(makeManifest(), CARD_CELLS);

    const diff = diffManifestRamReplay(replay, persisted, {
      storedFinalizationSha256: finalization.resultSha256,
      auditFinalizationSha256: finalization.resultSha256,
      unexpectedPerDrawWrites: 26,
    });
    assert.equal(diff.outcome, "MISMATCH");
    assert.equal(diff.unexpectedPerDrawWrites, 26);
  });

  it("MISMATCH on finalization checksum mismatch", () => {
    const replay = replayGame({ manifest: makeManifest(), cardNumbers: CARD_CELLS });
    const persisted = persistedFromReplay(replay);
    const { finalization } = buildManifestRamAuditFinalization(makeManifest(), CARD_CELLS);

    const diff = diffManifestRamReplay(replay, persisted, {
      storedFinalizationSha256: "0".repeat(64),
      auditFinalizationSha256: finalization.resultSha256,
      unexpectedPerDrawWrites: 0,
    });
    assert.equal(diff.outcome, "MISMATCH");
    assert.equal(diff.finalizationChecksumMismatch, true);
  });

  it("MISMATCH on Ding mismatch", () => {
    const replay = replayGame({ manifest: makeManifest(), cardNumbers: CARD_CELLS });
    const persisted = persistedFromReplay(replay);
    persisted.dingByUser = [{ userId: "u1", amount: 999 }];
    const { finalization } = buildManifestRamAuditFinalization(makeManifest(), CARD_CELLS);

    const diff = diffManifestRamReplay(replay, persisted, {
      storedFinalizationSha256: finalization.resultSha256,
      auditFinalizationSha256: finalization.resultSha256,
      unexpectedPerDrawWrites: 0,
    });
    assert.equal(diff.outcome, "MISMATCH");
    assert.ok(diff.dingDiff > 0);
  });

  it("MISMATCH on prize mismatch", () => {
    const replay = replayGame({ manifest: makeManifest(), cardNumbers: CARD_CELLS });
    const persisted = persistedFromReplay(replay);
    persisted.fullRewardAmounts = [1];
    const { finalization } = buildManifestRamAuditFinalization(makeManifest(), CARD_CELLS);

    const diff = diffManifestRamReplay(replay, persisted, {
      storedFinalizationSha256: finalization.resultSha256,
      auditFinalizationSha256: finalization.resultSha256,
      unexpectedPerDrawWrites: 0,
    });
    assert.equal(diff.outcome, "MISMATCH");
    assert.equal(diff.prizeMismatch, true);
  });
});

describe("per_draw audit regression", () => {
  it("unchanged MATCH against aligned persisted snapshot", () => {
    const replay = replayGame({ manifest: makeManifest(), cardNumbers: CARD_CELLS });
    const diff = diffReplayAgainstPersisted(replay, persistedFromReplay(replay));
    assert.equal(diff.outcome, "MATCH");
    assert.equal(diff.unexpectedPerDrawWrites, 0);
    assert.equal(diff.finalizationChecksumMismatch, false);
  });
});
