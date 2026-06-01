import { createClient, SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import type { EngineConfig } from "../config/env.js";

export type SupabaseAdmin = SupabaseClient;

export function createSupabaseAdmin(config: EngineConfig): SupabaseAdmin {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // Node 20 has no global WebSocket; Supabase Realtime still initializes on createClient.
    realtime: {
      transport: ws as unknown as typeof WebSocket,
    },
  });
}
