import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareDingCreditsFromState } from "../ding/index.js";
import { buildRegistryFromCardNumbers } from "../../core/card-registry/build.js";
import { evaluateDrawInRam } from "../room-loop/evaluateDrawInRam.js";
import { RoomRuntimeState } from "../../state/room-state.js";
import type { RoomRow, TicketRow } from "../../repositories/types.js";
import { computeFinalizationChecksums } from "./finalizationChecksum.js";
import { replayGame } from "./replayGame.js";
import {
  buildReplayResultFromState,
  toFinalizationResultFromReplay,
  toFinalizationResultFromState,
} from "./toFinalizationResult.js";
import type { GameManifest } from "./types.js";
import { RNG_ALGORITHM, RNG_VERSION } from "./types.js";
import { createHash } from "node:crypto";

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

function simulateLiveState(manifest: GameManifest): RoomRuntimeState {
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
    gameplay_persist_mode: "manifest_ram",
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

  const replay = replayGame({ manifest, cardNumbers: CARD_CELLS });
  for (const n of replay.drawSequence) {
    const evalResult = evaluateDrawInRam(state, n, registry);
    const ding = prepareDingCreditsFromState(
      state,
      n,
      evalResult.persistence.marks
    );
    state.accumulateRoomDing(ding.credits);
    state.recordDrawInserted(n);
    state.recordDrawProcessed(n);
  }
  return state;
}

describe("GameFinalizationResult checksum", () => {
  it("replayGame and live RAM stop produce identical resultSha256", () => {
    const manifest = makeManifest();
    const replay = replayGame({ manifest, cardNumbers: CARD_CELLS });
    const fromReplay = toFinalizationResultFromReplay(
      manifest.roomId,
      manifest.manifestVersion,
      replay
    );

    const liveState = simulateLiveState(manifest);
    const fromLive = toFinalizationResultFromState(
      liveState,
      manifest.commissionPool,
      manifest.manifestVersion
    );

    assert.equal(fromReplay.resultSha256, fromLive.resultSha256);
    assert.equal(fromReplay.marksSha256, fromLive.marksSha256);
    assert.deepEqual(fromReplay.payload.drawSequence, fromLive.payload.drawSequence);
    assert.equal(fromReplay.payload.stoppedReason, "full_house");
  });

  it("buildReplayResultFromState matches replayGame payload fields", () => {
    const manifest = makeManifest();
    const replay = replayGame({ manifest, cardNumbers: CARD_CELLS });
    const liveState = simulateLiveState(manifest);
    const fromState = buildReplayResultFromState(liveState, manifest.commissionPool);

    assert.deepEqual(fromState.drawSequence, replay.drawSequence);
    assert.deepEqual(fromState.lineWinners, replay.lineWinners);
    assert.deepEqual(fromState.fullWinners, replay.fullWinners);
    assert.deepEqual(fromState.dingByUser, replay.dingByUser);
    assert.equal(fromState.stoppedReason, replay.stoppedReason);
  });

  it("checksum is stable for identical payloads", () => {
    const manifest = makeManifest();
    const replay = replayGame({ manifest, cardNumbers: CARD_CELLS });
    const a = computeFinalizationChecksums({
      roomId: manifest.roomId,
      manifestVersion: 1,
      rngVersion: RNG_VERSION,
      payload: replay,
    });
    const b = computeFinalizationChecksums({
      roomId: manifest.roomId,
      manifestVersion: 1,
      rngVersion: RNG_VERSION,
      payload: replay,
    });
    assert.equal(a.resultSha256, b.resultSha256);
    assert.equal(a.marksSha256, b.marksSha256);
  });
});
