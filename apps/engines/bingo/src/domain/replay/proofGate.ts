import { PROOF_GATE_MIN_DAYS, PROOF_GATE_MIN_ROOMS } from "./types.js";

export interface ReplayProofGateSnapshot {
  matchRooms: number;
  mismatchCount: number;
  errorCount: number;
  firstComparedAt: Date | null;
  lastComparedAt: Date | null;
}

export interface ReplayProofGateResult {
  passed: boolean;
  matchRooms: number;
  mismatchCount: number;
  observationDays: number;
  reasons: string[];
}

export function evaluateReplayProofGate(
  snap: ReplayProofGateSnapshot,
  now: Date = new Date()
): ReplayProofGateResult {
  const reasons: string[] = [];
  const observationDays =
    snap.firstComparedAt && snap.lastComparedAt
      ? (snap.lastComparedAt.getTime() - snap.firstComparedAt.getTime()) / 86400000
      : snap.firstComparedAt
        ? (now.getTime() - snap.firstComparedAt.getTime()) / 86400000
        : 0;

  if (snap.mismatchCount > 0) {
    reasons.push("deterministic MISMATCH exists — blocks RAM-only cutover");
  }
  if (snap.matchRooms < PROOF_GATE_MIN_ROOMS) {
    reasons.push(
      `need ${PROOF_GATE_MIN_ROOMS} MATCH rooms, have ${snap.matchRooms}`
    );
  }
  if (observationDays < PROOF_GATE_MIN_DAYS) {
    reasons.push(
      `need ${PROOF_GATE_MIN_DAYS} days of observation, have ${observationDays.toFixed(2)}`
    );
  }

  return {
    passed: reasons.length === 0,
    matchRooms: snap.matchRooms,
    mismatchCount: snap.mismatchCount,
    observationDays,
    reasons,
  };
}
