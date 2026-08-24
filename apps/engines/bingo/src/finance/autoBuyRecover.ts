import type { SupabaseAdmin } from "../db/supabase-admin.js";
import type { Logger } from "../metrics/logger.js";

/**
 * Safety-net for running auto-buy sessions that missed the post-settlement hook.
 */
export async function recoverDueAutoBuySessions(
  supabase: SupabaseAdmin,
  log: Logger
): Promise<number> {
  const { data, error } = await supabase.rpc("fn_auto_buy_recover_due");
  if (error) {
    log.error("[AutoBuy] recover_due rpc failed", { error: error.message });
    return 0;
  }
  const count = Number(data ?? 0);
  if (count > 0) {
    log.info("[AutoBuy] recover_due processed", { count });
  }
  return count;
}
