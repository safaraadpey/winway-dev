import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickNextNumber } from "../../core/rng.js";
import { buildRegistryFromCardNumbers } from "../../core/card-registry/build.js";
import { evaluateDrawInRam } from "../room-loop/evaluateDrawInRam.js";
import { RoomRuntimeState } from "../../state/room-state.js";
import type { RoomRow, TicketRow } from "../../repositories/types.js";
import { diffReplayAgainstPersisted } from "./compareReplay.js";
import { evaluateReplayProofGate } from "./proofGate.js";
import { parseGameManifestPayload } from "./parseManifest.js";
import { replayGame } from "./replayGame.js";
import type { GameManifest } from "./types.js";
import { PROOF_GATE_MIN_ROOMS, RNG_ALGORITHM, RNG_VERSION } from "./types.js";

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

function makeSeed(): Buffer {
  return Buffer.from("11".repeat(32), "hex");
}

function makeManifest(): GameManifest {
  const seed = makeSeed();
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

describe("replayGame", () => {
  it("matches sequential evaluateDrawInRam on the same seed and cards", () => {
    const manifest = makeManifest();
    const seed = makeSeed();
    const replay = replayGame({ manifest, cardNumbers: CARD_CELLS });

    const registry = buildRegistryFromCardNumbers(CARD_CELLS);
    const room: RoomRow = {
      id: manifest.roomId,
      status: "playing",
      currency: "IRR",
      room_seed: `\\x${manifest.roomSeedHex}`,
      room_template_id: null,
      next_draw_at: null,
      starts_at: null,
      waiting_started_at: null,
      min_players: 1,
      max_players: null,
      countdown_sec: 120,
      first_line_draw_number: null,
      line_reward_percentage: 0.1,
      full_reward_percentage: 0.9,
      ding_per_number: 1,
      ding_settle_mode: "room_level",
      meta: null,
    };
    const tickets: TicketRow[] = [
      {
        id: "t1",
        room_id: manifest.roomId,
        player_user_id: "u1",
        pool_card_id: "c1",
        price: 20000,
        reservation_status: "reserved",
        cancelled_at: null,
      },
    ];
    const state = new RoomRuntimeState({
      room,
      tickets,
      markedByTicket: new Map(),
      existingLineTickets: new Set(),
      existingFullTickets: new Set(),
      drawnNumbers: [],
      unprocessedDrawNumbers: new Set(),
      templateDingPerNumber: 1,
    });

    const independent: number[] = [];
    for (let i = 0; i < 90; i++) {
      const n = pickNextNumber(seed, independent);
      if (n == null) break;
      const ev = evaluateDrawInRam(state, n, registry);
      independent.push(n);
      if (ev.fullWinnerThisDraw) break;
    }

    assert.deepEqual(replay.drawSequence, independent);
    assert.equal(replay.fullWinners.length, 1);
    assert.equal(replay.fullWinners[0]?.ticketId, "t1");
    assert.equal(replay.stoppedReason, "full_house");
    assert.ok(replay.drawSequence.length >= 15);
    assert.ok(replay.drawSequence.length <= 90);
  });

  it("diffs MATCH against its own persisted snapshot (first shadow MATCH)", () => {
    const replay = replayGame({ manifest: makeManifest(), cardNumbers: CARD_CELLS });
    const diff = diffReplayAgainstPersisted(replay, {
      drawSequence: replay.drawSequence,
      marks: replay.marks,
      lineWinners: replay.lineWinners,
      fullWinners: replay.fullWinners,
      dingByUser: replay.dingByUser,
      lineRewardAmounts: replay.lineWinners.map(() => replay.prizePreview.lineShare),
      fullRewardAmounts: replay.fullWinners.map(() => replay.prizePreview.fullShare),
    });
    assert.equal(diff.outcome, "MATCH");
    assert.equal(diff.drawDiffCount, 0);
    assert.equal(diff.markDiffCount, 0);
    assert.equal(diff.resultDiffCount, 0);
    assert.equal(diff.dingDiff, 0);
    assert.equal(diff.winnerMismatch, false);
    assert.equal(diff.prizeMismatch, false);
    assert.equal(diff.rosterMismatch, false);
    assert.equal(diff.drawCountMismatch, false);
    assert.equal(diff.postManifestTicketCount, 0);
    assert.equal(replay.prizePreview.lineShare + replay.prizePreview.fullShare > 0, true);
  });

  it("diffs MISMATCH when an extra ticket did not change winners or Ding", () => {
    const replay = replayGame({ manifest: makeManifest(), cardNumbers: CARD_CELLS });
    const diff = diffReplayAgainstPersisted(replay, {
      drawSequence: replay.drawSequence,
      marks: replay.marks,
      lineWinners: replay.lineWinners,
      fullWinners: replay.fullWinners,
      dingByUser: replay.dingByUser,
      lineRewardAmounts: replay.lineWinners.map(() => replay.prizePreview.lineShare),
      fullRewardAmounts: replay.fullWinners.map(() => replay.prizePreview.fullShare),
      manifestTicketIds: ["t1"],
      participatingTicketIds: ["t1", "t-extra"],
      postManifestTicketCount: 0,
    });
    assert.equal(diff.outcome, "MISMATCH");
    assert.equal(diff.rosterMismatch, true);
    assert.equal(diff.dingDiff, 0);
  });

  it("diffs MISMATCH when replay is longer by one ghost draw with zero extra marks", () => {
    const replay = replayGame({ manifest: makeManifest(), cardNumbers: CARD_CELLS });
    const diff = diffReplayAgainstPersisted(replay, {
      drawSequence: replay.drawSequence.slice(0, -1),
      marks: replay.marks.filter((m) => m.value !== replay.drawSequence.at(-1)),
      lineWinners: replay.lineWinners,
      fullWinners: [],
      dingByUser: replay.dingByUser,
      lineRewardAmounts: replay.lineWinners.map(() => replay.prizePreview.lineShare),
      fullRewardAmounts: [],
      manifestTicketIds: ["t1"],
      participatingTicketIds: ["t1"],
      postManifestTicketCount: 0,
    });
    assert.equal(diff.outcome, "MISMATCH");
    assert.equal(diff.drawCountMismatch, true);
  });

  it("diffs MISMATCH when stored draws diverge", () => {
    const replay = replayGame({ manifest: makeManifest(), cardNumbers: CARD_CELLS });
    const draws = [...replay.drawSequence];
    draws[0] = draws[0] === 1 ? 2 : 1;
    const diff = diffReplayAgainstPersisted(replay, {
      drawSequence: draws,
      marks: replay.marks,
      lineWinners: replay.lineWinners,
      fullWinners: replay.fullWinners,
      dingByUser: replay.dingByUser,
      lineRewardAmounts: replay.lineWinners.map(() => replay.prizePreview.lineShare),
      fullRewardAmounts: replay.fullWinners.map(() => replay.prizePreview.fullShare),
    });
    assert.equal(diff.outcome, "MISMATCH");
    assert.ok(diff.drawDiffCount > 0);
  });

  it("parses SQL-shaped jsonb payload", () => {
    const seed = makeSeed();
    const parsed = parseGameManifestPayload({
      room_id: "r1",
      room_seed: seed.toString("hex"),
      room_seed_hash: createHash("sha256").update(seed).digest("hex"),
      tickets: [
        {
          ticket_id: "t1",
          user_id: "u1",
          pool_card_id: "c1",
          card_no: 1,
          price: 10,
          grid_fingerprint: "abc",
        },
      ],
      commissions: [{ ticket_id: "t1", amount_to_pool: 9 }],
      commission_pool: 9,
      ding_per_number: 1,
      line_reward_percentage: 0.1,
      full_reward_percentage: 0.9,
      ding_settle_mode: "room_level",
      pool_id: "p1",
      pool_commit_hash: "h",
    });
    assert.equal(parsed.tickets[0]?.ticketId, "t1");
    assert.equal(parsed.commissionPool, 9);
  });
});

describe("evaluateReplayProofGate", () => {
  it("blocks until room count, duration, and zero mismatches", () => {
    const now = new Date("2026-09-20T00:00:00Z");
    const blocked = evaluateReplayProofGate(
      {
        matchRooms: 10,
        mismatchCount: 1,
        errorCount: 0,
        firstComparedAt: new Date("2026-09-04T00:00:00Z"),
        lastComparedAt: now,
      },
      now
    );
    assert.equal(blocked.passed, false);
    assert.ok(blocked.reasons.some((r) => r.includes("MISMATCH")));
    assert.ok(blocked.reasons.some((r) => r.includes(String(PROOF_GATE_MIN_ROOMS))));

    const start = new Date("2026-08-01T00:00:00Z");
    const passed = evaluateReplayProofGate(
      {
        matchRooms: PROOF_GATE_MIN_ROOMS,
        mismatchCount: 0,
        errorCount: 0,
        firstComparedAt: start,
        lastComparedAt: new Date("2026-08-20T00:00:00Z"),
      },
      now
    );
    assert.equal(passed.passed, true);
  });
});
