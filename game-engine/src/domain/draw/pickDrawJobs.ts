import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { DrawJob } from "./types.js";

/** Claim queued draw_jobs (queued → processing) via PostgREST RPC. */
export async function pickDrawJobs(
  supabase: SupabaseAdmin,
  limit: number
): Promise<DrawJob[]> {
  const { data, error } = await supabase.rpc("rpc_pick_draw_jobs", {
    p_limit: limit,
  });
  if (error) {
    throw new Error(`rpc_pick_draw_jobs failed: ${error.message}`);
  }
  return (data ?? []) as DrawJob[];
}
