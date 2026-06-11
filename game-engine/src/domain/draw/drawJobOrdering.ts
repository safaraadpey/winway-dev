/**
 * Ensures draw_jobs for a room are not evaluated while earlier draws remain
 * unprocessed in DB (processed_at IS NULL).
 */

import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";
import type { GameRepo } from "../../repositories/index.js";
import type { RoomRuntimeState } from "../../state/room-state.js";
import type { DrawJob } from "./types.js";

export async function shouldDeferDrawJob(
  repo: GameRepo,
  roomId: string,
  drawNumber: number,
  state?: RoomRuntimeState
): Promise<boolean> {
  if (state) {
    return state.hasEarlierUnprocessedDraw(drawNumber);
  }
  return repo.hasEarlierUnprocessedDraws(roomId, drawNumber);
}

/** Return job to queue without incrementing attempts — not its turn yet. */
export async function deferDrawJobToQueue(
  supabase: SupabaseAdmin,
  log: Logger,
  job: DrawJob
): Promise<"requeue"> {
  const now = new Date().toISOString();
  await supabase
    .from("draw_jobs")
    .update({ status: "queued", updated_at: now })
    .eq("id", job.id)
    .eq("status", "processing");

  log.info("draw job deferred (earlier draws pending)", {
    jobId: job.id,
    roomId: job.room_id,
    drawNumber: job.draw_number,
  });
  return "requeue";
}
