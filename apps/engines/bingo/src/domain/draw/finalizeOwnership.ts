/**
 * Live-actor-owned predicate — must match sql/migrations/20260904130000_finalize_single_owner.sql
 */
import type { RoomRow } from "../../repositories/types.js";

export type RoomLeaseSnapshot = Pick<
  RoomRow,
  "status" | "engine_owner_id" | "engine_lease_until" | "engine_lease_epoch"
>;

export interface FinalizeCallerFence {
  ownerId: string;
  leaseEpoch: number;
}

/** Room has an active RoomLoop lease (playing + owner + unexpired lease). */
export function isLiveActorOwnedRoom(
  room: RoomLeaseSnapshot | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!room || room.status !== "playing") return false;
  if (!room.engine_owner_id?.trim()) return false;
  if (!room.engine_lease_until) return false;
  return Date.parse(room.engine_lease_until) > nowMs;
}

/** Whether this caller may invoke rpc_finalize_engine_draw_job for the room. */
export function canCallerFinalizeDraw(
  room: RoomLeaseSnapshot | null | undefined,
  fence: FinalizeCallerFence | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!isLiveActorOwnedRoom(room, nowMs)) return true;
  if (!fence) return false;
  return (
    room!.engine_owner_id === fence.ownerId &&
    room!.engine_lease_epoch === fence.leaseEpoch
  );
}
