/**
 * Strict parity validator for scan vs bitmask shadow execution.
 * Used only in MARKING_ENGINE=dual — scan remains authoritative.
 */

import { maskFromMarkedValues } from "../core/bitmask/masks.js";
import type { GlobalCardRegistry } from "../core/card-registry/types.js";
import type { EvaluateOutput, WinResult, WinType } from "../core/winEvaluation.js";

export type MismatchKind =
  | "marks"
  | "line_wins"
  | "full_wins"
  | "all_wins"
  | "full_winner_flag"
  | "first_line_flag"
  | "mask_diff";

export interface MarkRow {
  ticket_id: string;
  value: number;
}

export interface DualModeValidationContext {
  roomId: string;
  drawNumber: number;
  /** Full draw sequence including current draw. */
  drawSequence: readonly number[];
  drawsProcessed: number;
  /** True when this draw ran after DB reconcile (reconnect / checkpoint). */
  wasReconciled: boolean;
  hasUnprocessedDraw: boolean;
  firstLineDrawNumber: number | null;
  ticketCount: number;
}

export interface MaskDiffEntry {
  ticketId: string;
  cardId: string;
  scanMask: number;
  bitmaskMask: number;
  xor: number;
}

export interface MismatchDetail {
  kind: MismatchKind;
  message: string;
  scan?: unknown;
  bitmask?: unknown;
  maskDiffs?: MaskDiffEntry[];
}

export interface DualModeValidationInput {
  context: DualModeValidationContext;
  scan: {
    markRows: MarkRow[];
    evalOut: EvaluateOutput;
    /** Post-scan marked sets (authoritative path). */
    markedByTicket: ReadonlyMap<string, ReadonlySet<number>>;
  };
  bitmask: {
    markRows: MarkRow[];
    evalOut: EvaluateOutput;
    maskByTicket: ReadonlyMap<string, number>;
  };
  ticketCardId: ReadonlyMap<string, string>;
  registry: GlobalCardRegistry;
}

export interface DualModeValidationResult {
  parity: boolean;
  mismatches: MismatchDetail[];
}

export function validateDualModeParity(
  input: DualModeValidationInput
): DualModeValidationResult {
  const mismatches: MismatchDetail[] = [];

  compareMarks(input, mismatches);
  compareWinSet(input, "line", mismatches);
  compareWinSet(input, "full", mismatches);
  compareFlags(input, mismatches);
  compareMasks(input, mismatches);

  return { parity: mismatches.length === 0, mismatches };
}

function compareMarks(
  input: DualModeValidationInput,
  mismatches: MismatchDetail[]
): void {
  const scan = markKeySet(input.scan.markRows);
  const bitmask = markKeySet(input.bitmask.markRows);
  if (setEqual(scan, bitmask)) return;

  mismatches.push({
    kind: "marks",
    message: "mark rows differ between scan and bitmask",
    scan: [...scan].sort(),
    bitmask: [...bitmask].sort(),
  });
}

function compareWinSet(
  input: DualModeValidationInput,
  winType: WinType,
  mismatches: MismatchDetail[]
): void {
  const scan = winKeySet(input.scan.evalOut.newResults, winType);
  const bitmask = winKeySet(input.bitmask.evalOut.newResults, winType);
  if (setEqual(scan, bitmask)) return;

  mismatches.push({
    kind: winType === "line" ? "line_wins" : "full_wins",
    message: `${winType} winners differ`,
    scan: [...scan].sort(),
    bitmask: [...bitmask].sort(),
  });
}

function compareFlags(
  input: DualModeValidationInput,
  mismatches: MismatchDetail[]
): void {
  if (
    input.scan.evalOut.fullWinnerThisDraw !==
    input.bitmask.evalOut.fullWinnerThisDraw
  ) {
    mismatches.push({
      kind: "full_winner_flag",
      message: "fullWinnerThisDraw flag mismatch",
      scan: input.scan.evalOut.fullWinnerThisDraw,
      bitmask: input.bitmask.evalOut.fullWinnerThisDraw,
    });
  }

  if (
    input.scan.evalOut.setFirstLineDrawNumber !==
    input.bitmask.evalOut.setFirstLineDrawNumber
  ) {
    mismatches.push({
      kind: "first_line_flag",
      message: "setFirstLineDrawNumber flag mismatch",
      scan: input.scan.evalOut.setFirstLineDrawNumber,
      bitmask: input.bitmask.evalOut.setFirstLineDrawNumber,
    });
  }

  const scanAll = allWinKeySet(input.scan.evalOut.newResults);
  const bitmaskAll = allWinKeySet(input.bitmask.evalOut.newResults);
  if (!setEqual(scanAll, bitmaskAll)) {
    mismatches.push({
      kind: "all_wins",
      message: "combined winner set mismatch",
      scan: [...scanAll].sort(),
      bitmask: [...bitmaskAll].sort(),
    });
  }
}

function compareMasks(
  input: DualModeValidationInput,
  mismatches: MismatchDetail[]
): void {
  const diffs: MaskDiffEntry[] = [];
  const ticketIds = new Set([
    ...input.scan.markedByTicket.keys(),
    ...input.bitmask.maskByTicket.keys(),
    ...input.ticketCardId.keys(),
  ]);

  for (const ticketId of ticketIds) {
    const cardId = input.ticketCardId.get(ticketId);
    if (!cardId) continue;
    const valueToBit = input.registry.valueToBitByCard.get(cardId);
    if (!valueToBit) continue;

    const marked = input.scan.markedByTicket.get(ticketId) ?? new Set<number>();
    const scanMask = maskFromMarkedValues(marked, valueToBit);
    const bitmaskMask = input.bitmask.maskByTicket.get(ticketId) ?? 0;

    if (scanMask === bitmaskMask) continue;
    diffs.push({
      ticketId,
      cardId,
      scanMask,
      bitmaskMask,
      xor: scanMask ^ bitmaskMask,
    });
  }

  if (diffs.length === 0) return;

  mismatches.push({
    kind: "mask_diff",
    message: "card mask state differs after draw",
    maskDiffs: diffs,
  });
}

function markKeySet(rows: MarkRow[]): Set<string> {
  return new Set(rows.map((r) => `${r.ticket_id}:${r.value}`));
}

function winKeySet(results: WinResult[], winType: WinType): Set<string> {
  return new Set(
    results
      .filter((r) => r.winType === winType)
      .map((r) => `${r.ticketId}:${r.userId}`)
  );
}

function allWinKeySet(results: WinResult[]): Set<string> {
  return new Set(results.map((r) => `${r.ticketId}:${r.winType}:${r.userId}`));
}

function setEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
