import type {
  GameReplayResult,
  PersistedGameplaySnapshot,
  ReplayDiff,
} from "./types.js";
import {
  diffDrawSequencesByPosition,
  diffReplayCoreOutcomes,
} from "./compareReplayCore.js";

/** per_draw rooms — preserve existing position-ordered draw sequence audit semantics. */
export function diffReplayAgainstPersisted(
  replay: GameReplayResult,
  persisted: PersistedGameplaySnapshot
): ReplayDiff {
  const { drawDiffCount, drawCountMismatch } = diffDrawSequencesByPosition(
    replay.drawSequence,
    persisted.drawSequence
  );
  const core = diffReplayCoreOutcomes(replay, persisted);

  const mismatch =
    drawDiffCount > 0 ||
    core.markDiffCount > 0 ||
    core.resultDiffCount > 0 ||
    core.winnerMismatch ||
    core.dingDiff > 0 ||
    core.prizeMismatch ||
    core.rosterMismatch ||
    drawCountMismatch ||
    core.postManifestTicketCount > 0;

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
    unexpectedPerDrawWrites: 0,
    finalizationChecksumMismatch: false,
  };
}
