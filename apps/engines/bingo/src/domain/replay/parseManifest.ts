import { createHash } from "node:crypto";
import type { GameManifest, GameManifestTicket } from "./types.js";
import {
  GAME_MANIFEST_VERSION,
  RNG_ALGORITHM,
  RNG_VERSION,
} from "./types.js";

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function parseTicket(raw: Record<string, unknown>): GameManifestTicket {
  return {
    ticketId: str(raw.ticket_id ?? raw.ticketId),
    userId: str(raw.user_id ?? raw.userId),
    poolCardId: str(raw.pool_card_id ?? raw.poolCardId),
    cardNo: raw.card_no == null && raw.cardNo == null ? null : num(raw.card_no ?? raw.cardNo),
    price: num(raw.price),
    gridFingerprint: str(raw.grid_fingerprint ?? raw.gridFingerprint),
  };
}

/** Parse JSONB payload from game_manifests.payload. */
export function parseGameManifestPayload(
  payload: unknown,
  meta?: { rngAlgorithm?: string; rngVersion?: string; manifestVersion?: number }
): GameManifest {
  if (!payload || typeof payload !== "object") {
    throw new Error("game_manifest payload missing");
  }
  const p = payload as Record<string, unknown>;
  const ticketsRaw = Array.isArray(p.tickets) ? p.tickets : [];
  const commissionsRaw = Array.isArray(p.commissions) ? p.commissions : [];
  const dingMode = str(p.ding_settle_mode ?? p.dingSettleMode) || "per_draw";

  const manifest: GameManifest = {
    roomId: str(p.room_id ?? p.roomId),
    roomSeedHex: str(p.room_seed ?? p.roomSeedHex).replace(/^\\x/i, "").toLowerCase(),
    roomSeedHash: str(p.room_seed_hash ?? p.roomSeedHash).toLowerCase(),
    rngAlgorithm: RNG_ALGORITHM,
    rngVersion: RNG_VERSION,
    manifestVersion: num(p.manifest_version ?? p.manifestVersion ?? meta?.manifestVersion, GAME_MANIFEST_VERSION),
    poolId: str(p.pool_id ?? p.poolId),
    poolCommitHash: str(p.pool_commit_hash ?? p.poolCommitHash),
    poolPrngVersion: str(p.pool_prng_version ?? p.poolPrngVersion) || "v1",
    dingPerNumber: Math.trunc(num(p.ding_per_number ?? p.dingPerNumber, 1)),
    lineRewardPercentage: num(p.line_reward_percentage ?? p.lineRewardPercentage, 0.5),
    fullRewardPercentage: num(p.full_reward_percentage ?? p.fullRewardPercentage, 0.5),
    dingSettleMode: dingMode === "room_level" ? "room_level" : "per_draw",
    currency: str(p.currency) || "IRR",
    cardPrice:
      p.card_price == null && p.cardPrice == null ? null : num(p.card_price ?? p.cardPrice),
    commissionPool: num(p.commission_pool ?? p.commissionPool),
    commissions: commissionsRaw.map((c) => {
      const row = (c ?? {}) as Record<string, unknown>;
      return {
        ticketId: str(row.ticket_id ?? row.ticketId),
        amountToPool: num(row.amount_to_pool ?? row.amountToPool),
      };
    }),
    tickets: ticketsRaw.map((t) => parseTicket((t ?? {}) as Record<string, unknown>)),
  };

  if (meta?.rngAlgorithm && meta.rngAlgorithm !== RNG_ALGORITHM) {
    throw new Error(`unsupported rng_algorithm ${meta.rngAlgorithm}`);
  }
  if (meta?.rngVersion && meta.rngVersion !== RNG_VERSION) {
    throw new Error(`unsupported rng_version ${meta.rngVersion}`);
  }

  return manifest;
}

export function assertManifestSeed(manifest: GameManifest): Buffer {
  const seed = Buffer.from(manifest.roomSeedHex, "hex");
  if (seed.length !== 32 || manifest.roomSeedHex.length !== 64) {
    throw new Error("game_manifest room_seed must be 32 bytes hex");
  }
  const hash = createHash("sha256").update(seed).digest("hex");
  if (hash !== manifest.roomSeedHash) {
    throw new Error("game_manifest room_seed_hash mismatch");
  }
  return seed;
}
