import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { EngineConfig } from "../config/env.js";

export type SupabaseAdmin = SupabaseClient;

export function createSupabaseAdmin(config: EngineConfig): SupabaseAdmin {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
