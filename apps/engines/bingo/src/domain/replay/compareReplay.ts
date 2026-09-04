import { round2 } from "../../core/money.js";
import type {
  GameReplayResult,
  PersistedGameplaySnapshot,
  ReplayDiff,
} from "./types.js";

function markKey(ticketId: string, value: number): string {
  return `${ticketId}:${value}`;
}

function winnerKey(ticketId: string, kind: "line" | "full", drawNumber: number): string {
  return `${kind}:${ticketId}:${drawNumber}`;
}

function setDiffCount(a: Iterable<string>, b: Iterable<string>): number {
  const left = new Set(a);
  const right = new Set(b);
  let n = 0;
  for (const x of left) if (!right.has(x)) n += 1;
  for (const x of right) if (!left.has(x)) n += 1;
  return n;
}

function amountsMismatch(stored: number[], expectedShare: number): boolean {
  if (stored.length === 0) return round2(expectedShare) !== 0;
  const share = round2(expectedShare);
  return stored.some((amt) => round2(amt) !== share);
}

export function diffReplayAgainstPersisted(
  replay: GameReplayResult,
  persisted: PersistedGameplaySnapshot
): ReplayDiff {
  let drawDiffCount = 0;
  const n = Math.max(replay.drawSequence.length, persisted.drawSequence.length);
  for (let i = 0; i < n; i++) {
    if (replay.drawSequence[i] !== persisted.drawSequence[i]) drawDiffCount += 1;
  }

  const markDiffCount = setDiffCount(
    replay.marks.map((m) => markKey(m.ticketId, m.value)),
    persisted.marks.map((m) => markKey(m.ticketId, m.value))
  );

  const replayResults = [
    ...replay.lineWinners.map((w) => winnerKey(w.ticketId, "line", w.drawNumber)),
    ...replay.fullWinners.map((w) => winnerKey(w.ticketId, "full", w.drawNumber)),
  ];
  const storedResults = [
    ...persisted.lineWinners.map((w) => winnerKey(w.ticketId, "line", w.drawNumber)),
    ...persisted.fullWinners.map((w) => winnerKey(w.ticketId, "full", w.drawNumber)),
  ];
  const resultDiffCount = setDiffCount(replayResults, storedResults);

  const winnerMismatch =
    setDiffCount(
      replay.lineWinners.map((w) => w.ticketId),
      persisted.lineWinners.map((w) => w.ticketId)
    ) > 0 ||
    setDiffCount(
      replay.fullWinners.map((w) => w.ticketId),
      persisted.fullWinners.map((w) => w.ticketId)
    ) > 0;

  const dingReplay = new Map(replay.dingByUser.map((d) => [d.userId, d.amount]));
  const dingStored = new Map(persisted.dingByUser.map((d) => [d.userId, d.amount]));
  const dingUsers = new Set([...dingReplay.keys(), ...dingStored.keys()]);
  let dingDiff = 0;
  for (const userId of dingUsers) {
    dingDiff += Math.abs((dingReplay.get(userId) ?? 0) - (dingStored.get(userId) ?? 0));
  }

  const prizeMismatch =
    amountsMismatch(persisted.lineRewardAmounts, replay.prizePreview.lineShare) ||
    amountsMismatch(persisted.fullRewardAmounts, replay.prizePreview.fullShare);

  const drawCountMismatch =
    replay.drawSequence.length !== persisted.drawSequence.length;

  const rosterMismatch =
    persisted.manifestTicketIds != null &&
    persisted.participatingTicketIds != null &&
    setDiffCount(persisted.manifestTicketIds, persisted.participatingTicketIds) > 0;

  const postManifestTicketCount = persisted.postManifestTicketCount ?? 0;

  const mismatch =
    drawDiffCount > 0 ||
    markDiffCount > 0 ||
    resultDiffCount > 0 ||
    winnerMismatch ||
    dingDiff > 0 ||
    prizeMismatch ||
    rosterMismatch ||
    drawCountMismatch ||
    postManifestTicketCount > 0;

  return {
    outcome: mismatch ? "MISMATCH" : "MATCH",
    drawDiffCount,
    markDiffCount,
    resultDiffCount,
    dingDiff,
    winnerMismatch,
    prizeMismatch,
    rosterMismatch,
    drawCountMismatch,
    postManifestTicketCount,
  };
}
