/**
 * Thin lease helpers over the rpc_*_game_room functions.
 *
 * The lease is the single-owner guarantee for a room's draw clock: only the
 * replica holding the (unexpired) lease may insert draws via the owner-guarded
 * insert RPC. Discovery + claim happens in RoomLoopManager; renew/release here.
 */
import type { GameRepo } from "../../repositories/index.js";
import type { RoomClaimResult } from "../../repositories/types.js";

export interface LeaseConfig {
  ownerId: string;
  leaseSeconds: number;
  leaseEpoch?: number | null;
}

export async function claimRoomLease(
  repo: GameRepo,
  roomId: string,
  cfg: Pick<LeaseConfig, "ownerId" | "leaseSeconds">
): Promise<RoomClaimResult> {
  return repo.claimRoom(roomId, cfg.ownerId, cfg.leaseSeconds);
}

export async function renewRoomLease(
  repo: GameRepo,
  roomId: string,
  cfg: LeaseConfig
): Promise<boolean> {
  return repo.renewLease(
    roomId,
    cfg.ownerId,
    cfg.leaseSeconds,
    cfg.leaseEpoch ?? null
  );
}

export async function releaseRoomLease(
  repo: GameRepo,
  roomId: string,
  cfg: LeaseConfig
): Promise<boolean> {
  return repo.releaseRoom(roomId, cfg.ownerId, cfg.leaseEpoch ?? null);
}

/**
 * Renew when more than half the lease has elapsed since the last renew, so we
 * never let the lease lapse mid-cycle yet avoid renewing on every draw.
 */
export function shouldRenew(
  lastRenewMs: number,
  leaseSeconds: number,
  now = Date.now()
): boolean {
  return now - lastRenewMs >= (leaseSeconds * 1000) / 2;
}
