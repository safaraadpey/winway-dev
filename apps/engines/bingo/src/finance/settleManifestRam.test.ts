import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { finalizationToRpcJson } from "./settleManifestRam.js";
import type { GameFinalizationResult } from "../domain/replay/types.js";
import { RNG_ALGORITHM, RNG_VERSION } from "../domain/replay/types.js";

describe("finalizationToRpcJson", () => {
  it("includes payload marks for bulk history RPC", () => {
    const finalization: GameFinalizationResult = {
      contractVersion: 1,
      roomId: "11111111-1111-1111-1111-111111111111",
      manifestVersion: 1,
      rngAlgorithm: RNG_ALGORITHM,
      rngVersion: RNG_VERSION,
      dingSettlementKey: "bingo.ding_room:11111111-1111-1111-1111-111111111111:v1",
      dingSettlementVersion: 1,
      resultSha256: "a".repeat(64),
      marksSha256: "b".repeat(64),
      payload: {
        manifestVersion: 1,
        rngAlgorithm: RNG_ALGORITHM,
        rngVersion: RNG_VERSION,
        drawSequence: [7, 10],
        firstLineDrawNumber: null,
        lineWinners: [],
        fullWinners: [],
        marks: [{ ticketId: "t1", value: 7 }],
        dingByUser: [],
        prizePreview: {
          totalPool: 100,
          linePool: 0,
          fullPool: 100,
          lineShare: 0,
          fullShare: 100,
          lineWinners: 0,
          fullWinners: 0,
        },
        stoppedReason: "exhausted",
      },
    };

    const rpc = finalizationToRpcJson(finalization);
    const payload = rpc.payload as { marks: unknown[] };
    assert.equal(payload.marks.length, 1);
    assert.equal(rpc.resultSha256, finalization.resultSha256);
  });
});
