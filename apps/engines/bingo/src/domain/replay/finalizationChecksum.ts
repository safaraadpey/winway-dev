/**
 * Canonical checksum for GameFinalizationResult — live stop and replayGame must match.
 */
import { createHash } from "node:crypto";
import type { GameReplayMark, GameReplayResult } from "./types.js";

export const FINALIZATION_CONTRACT_VERSION = 1;

function sortWinners<T extends { ticketId: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.ticketId.localeCompare(b.ticketId));
}

function sortDing(rows: readonly { userId: string; amount: number }[]) {
  return [...rows].sort((a, b) => a.userId.localeCompare(b.userId));
}

function sortMarks(rows: readonly GameReplayMark[]): GameReplayMark[] {
  return [...rows].sort((a, b) => {
    const t = a.ticketId.localeCompare(b.ticketId);
    return t !== 0 ? t : a.value - b.value;
  });
}

/** sha256 of sorted ticketId:value marks (not included in resultSha256 payload). */
export function computeMarksSha256(marks: readonly GameReplayMark[]): string {
  const canonical = sortMarks(marks).map((m) => `${m.ticketId}:${m.value}`).join(",");
  return createHash("sha256").update(canonical).digest("hex");
}

/** Stable JSON object for resultSha256 — sorted keys, sorted arrays. */
export function canonicalFinalizationBody(args: {
  roomId: string;
  manifestVersion: number;
  rngVersion: string;
  payload: GameReplayResult;
}): Record<string, unknown> {
  const { payload } = args;
  return {
    roomId: args.roomId,
    manifestVersion: args.manifestVersion,
    rngVersion: args.rngVersion,
    drawSequence: [...payload.drawSequence],
    stoppedReason: payload.stoppedReason,
    firstLineDrawNumber: payload.firstLineDrawNumber,
    lineWinners: sortWinners(payload.lineWinners),
    fullWinners: sortWinners(payload.fullWinners),
    dingByUser: sortDing(payload.dingByUser),
    prizePreview: {
      totalPool: payload.prizePreview.totalPool,
      linePool: payload.prizePreview.linePool,
      fullPool: payload.prizePreview.fullPool,
      lineShare: payload.prizePreview.lineShare,
      fullShare: payload.prizePreview.fullShare,
      lineWinners: payload.prizePreview.lineWinners,
      fullWinners: payload.prizePreview.fullWinners,
    },
  };
}

export function sha256Canonical(value: unknown): string {
  const json = JSON.stringify(value);
  return createHash("sha256").update(json).digest("hex");
}

export function computeFinalizationChecksums(args: {
  roomId: string;
  manifestVersion: number;
  rngVersion: string;
  payload: GameReplayResult;
}): { resultSha256: string; marksSha256: string } {
  const body = canonicalFinalizationBody(args);
  return {
    resultSha256: sha256Canonical(body),
    marksSha256: computeMarksSha256(args.payload.marks),
  };
}
