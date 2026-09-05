/**
 * Immutable Game Manifest + shadow replay contracts.
 * RNG: SHA256_ORDERING v1 — lib/provablyFairDrawSpec.ts / core/rng.ts
 */

export const GAME_MANIFEST_VERSION = 1;
export const RNG_ALGORITHM = "SHA256_ORDERING" as const;
export const RNG_VERSION = "v1";

export const PROOF_GATE_MIN_ROOMS = 2000;
export const PROOF_GATE_MIN_DAYS = 14;

export type DingSettleMode = "per_draw" | "room_level";
export type GameplayPersistMode = "per_draw" | "manifest_ram";
export type ReplayStoppedReason = "full_house" | "exhausted";
export type ReplayAuditOutcome = "MATCH" | "MISMATCH" | "ERROR";

export interface GameManifestTicket {
  ticketId: string;
  userId: string;
  poolCardId: string;
  cardNo: number | null;
  price: number;
  gridFingerprint: string;
}

export interface GameManifestCommission {
  ticketId: string;
  amountToPool: number;
}

export interface GameManifest {
  roomId: string;
  roomSeedHex: string;
  roomSeedHash: string;
  rngAlgorithm: typeof RNG_ALGORITHM;
  rngVersion: typeof RNG_VERSION;
  manifestVersion: number;
  poolId: string;
  poolCommitHash: string;
  poolPrngVersion: string;
  dingPerNumber: number;
  lineRewardPercentage: number;
  fullRewardPercentage: number;
  dingSettleMode: DingSettleMode;
  currency: string;
  cardPrice: number | null;
  commissionPool: number;
  commissions: GameManifestCommission[];
  tickets: GameManifestTicket[];
}

export interface GameReplayWinner {
  ticketId: string;
  userId: string;
  drawNumber: number;
}

export interface GameReplayMark {
  ticketId: string;
  value: number;
}

export interface GameReplayDing {
  userId: string;
  amount: number;
}

export interface GameReplayPrizePreview {
  totalPool: number;
  linePool: number;
  fullPool: number;
  lineShare: number;
  fullShare: number;
  lineWinners: number;
  fullWinners: number;
}

export interface GameReplayResult {
  manifestVersion: number;
  rngAlgorithm: typeof RNG_ALGORITHM;
  rngVersion: typeof RNG_VERSION;
  drawSequence: number[];
  firstLineDrawNumber: number | null;
  lineWinners: GameReplayWinner[];
  fullWinners: GameReplayWinner[];
  marks: GameReplayMark[];
  dingByUser: GameReplayDing[];
  prizePreview: GameReplayPrizePreview;
  stoppedReason: ReplayStoppedReason;
}

export interface PersistedGameplaySnapshot {
  drawSequence: number[];
  marks: GameReplayMark[];
  lineWinners: GameReplayWinner[];
  fullWinners: GameReplayWinner[];
  dingByUser: GameReplayDing[];
  lineRewardAmounts: number[];
  fullRewardAmounts: number[];
  manifestTicketIds?: string[];
  participatingTicketIds?: string[];
  postManifestTicketCount?: number;
}

export interface ReplayDiff {
  outcome: ReplayAuditOutcome;
  drawDiffCount: number;
  markDiffCount: number;
  resultDiffCount: number;
  dingDiff: number;
  winnerMismatch: boolean;
  prizeMismatch: boolean;
  rosterMismatch: boolean;
  drawCountMismatch: boolean;
  postManifestTicketCount: number;
  errorCode?: string;
}

export interface GameReplayJobRow {
  id: number;
  room_id: string;
  status: string;
  attempts: number;
  created_at: string;
}

/** Versioned wrapper — live stop and replayGame must produce identical checksums. */
export interface GameFinalizationResult {
  contractVersion: number;
  roomId: string;
  manifestVersion: number;
  rngAlgorithm: typeof RNG_ALGORITHM;
  rngVersion: typeof RNG_VERSION;
  payload: GameReplayResult;
  dingSettlementKey: string;
  dingSettlementVersion: number;
  resultSha256: string;
  marksSha256: string;
}
