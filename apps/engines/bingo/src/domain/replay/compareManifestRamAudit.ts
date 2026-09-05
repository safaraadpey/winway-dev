/**
 * Shadow replay diff for manifest_ram rooms.
 * Authoritative: manifest → replayGame(manifest) → finalization checksum + final persisted outcomes.
 * Bulk history at settlement is compared by content/set, not per-draw processed_at timing.
 */
import {
  diffDrawSequencesByPosition,
  diffReplayCoreOutcomes,
} from "./compareReplayCore.js";
import type { GameReplayResult, PersistedGameplaySnapshot, ReplayDiff } from "./types.js";

export interface ManifestRamAuditArgs {
  storedFinalizationSha256: string | null;
  auditFinalizationSha256: string;
  unexpectedPerDrawWrites: number;
}

/** Content/set equality — order is verified via finalization checksum. */
export function diffDrawSequenceMultiset(
  replaySequence: readonly number[],
  persistedSequence: readonly number[]
): { drawDiffCount: number; drawCountMismatch: boolean } {
  if (persistedSequence.length === 0) {
    return { drawDiffCount: 0, drawCountMismatch: false };
  }
  const drawCountMismatch = replaySequence.length !== persistedSequence.length;
  const left = [...replaySequence].sort((a, b) => a - b);
  const right = [...persistedSequence].sort((a, b) => a - b);
  let drawDiffCount = 0;
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) {
    if (left[i] !== right[i]) drawDiffCount += 1;
  }
  return { drawDiffCount, drawCountMismatch };
}

export function diffManifestRamReplay(
  replay: GameReplayResult,
  persisted: PersistedGameplaySnapshot,
  args: ManifestRamAuditArgs
): ReplayDiff {
  const finalizationChecksumMismatch =
    args.storedFinalizationSha256 != null &&
    args.storedFinalizationSha256 !== args.auditFinalizationSha256;

  const historyPersisted = persisted.drawSequence.length > 0;
  const drawCompare = historyPersisted
    ? finalizationChecksumMismatch
      ? diffDrawSequencesByPosition(replay.drawSequence, persisted.drawSequence)
      : diffDrawSequenceMultiset(replay.drawSequence, persisted.drawSequence)
    : { drawDiffCount: 0, drawCountMismatch: false };

  // When checksum matches, draw order is already covered by finalization contract.
  const drawDiffCount = finalizationChecksumMismatch
    ? drawCompare.drawDiffCount
    : historyPersisted
      ? drawCompare.drawDiffCount
      : 0;
  const drawCountMismatch = finalizationChecksumMismatch
    ? drawCompare.drawCountMismatch
    : historyPersisted
      ? drawCompare.drawCountMismatch
      : false;

  const core = diffReplayCoreOutcomes(replay, persisted);

  const mismatch =
    finalizationChecksumMismatch ||
    args.unexpectedPerDrawWrites > 0 ||
    core.markDiffCount > 0 ||
    core.resultDiffCount > 0 ||
    core.winnerMismatch ||
    core.dingDiff > 0 ||
    core.prizeMismatch ||
    core.rosterMismatch ||
    core.postManifestTicketCount > 0 ||
    (historyPersisted && (drawDiffCount > 0 || drawCountMismatch));

  return {
    outcome: mismatch ? "MISMATCH" : "MATCH",
    drawDiffCount,
    markDiffCount: core.markDiffCount,
    resultDiffCount: core.resultDiffCount,
    dingDiff: core.dingDiff,
    winnerMismatch: core.winnerMismatch,
    prizeMismatch: core.prizeMismatch,
    rosterMismatch: core.rosterMismatch,
    drawCountMismatch,
    postManifestTicketCount: core.postManifestTicketCount,
    unexpectedPerDrawWrites: args.unexpectedPerDrawWrites,
    finalizationChecksumMismatch,
  };
}

/** Convenience for tests — prize amounts from replay preview. */
export function persistedFromReplay(replay: GameReplayResult): PersistedGameplaySnapshot {
  return {
    drawSequence: replay.drawSequence,
    marks: replay.marks,
    lineWinners: replay.lineWinners,
    fullWinners: replay.fullWinners,
    dingByUser: replay.dingByUser,
    lineRewardAmounts: replay.lineWinners.map(() => replay.prizePreview.lineShare),
    fullRewardAmounts: replay.fullWinners.map(() => replay.prizePreview.fullShare),
  };
}
