import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";
import { wakeDrawProcessor } from "../../runtime/draw-processor-wake.js";

/**
 * Supabase Realtime on draw_jobs INSERT — wakes processor when scheduler runs
 * in another process/replica or when the in-process wake was missed.
 */
export function startDrawJobWakeListener(
  supabase: SupabaseAdmin,
  log: Logger
): () => void {
  const channel = supabase
    .channel("draw-processor-job-wake")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "draw_jobs" },
      () => {
        wakeDrawProcessor("realtime");
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        log.info("draw-processor wake listener subscribed");
      } else if (status === "CHANNEL_ERROR") {
        log.warn("draw-processor wake listener channel error");
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
