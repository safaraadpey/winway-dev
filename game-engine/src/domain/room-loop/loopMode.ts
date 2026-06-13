/**
 * Per-room gating for the actor loop.
 *
 * Global default comes from ROOM_LOOP_MODE; an individual room can opt in/out
 * via rooms.meta.loop_mode ('actor' | 'scheduler_queue'). During rollout only
 * rooms explicitly tagged 'actor' take the new path; everything else stays on
 * the legacy scheduler+queue pipeline.
 */
import type { RoomLoopMode } from "../../config/env.js";
import type { RoomRow } from "../../repositories/types.js";

export function roomLoopModeFor(
  room: Pick<RoomRow, "meta">,
  globalMode: RoomLoopMode
): RoomLoopMode {
  const raw = room.meta?.["loop_mode"];
  if (raw === "actor") return "actor";
  if (raw === "scheduler_queue") return "scheduler_queue";
  return globalMode;
}

/** True when this room should be driven by the room-actor loop. */
export function isActorRoom(
  room: Pick<RoomRow, "meta">,
  globalMode: RoomLoopMode
): boolean {
  return roomLoopModeFor(room, globalMode) === "actor";
}
