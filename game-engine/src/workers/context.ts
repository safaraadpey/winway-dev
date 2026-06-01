import type { EngineConfig } from "../config/env.js";
import type { SupabaseAdmin } from "../db/supabase-admin.js";
import type { Logger } from "../metrics/logger.js";
import type { GameRedis } from "../redis/types.js";

export interface WorkerContext {
  supabase: SupabaseAdmin;
  config: EngineConfig;
  log: Logger;
  /** Null when Redis is not configured (single-instance mode). */
  redis: GameRedis | null;
}
