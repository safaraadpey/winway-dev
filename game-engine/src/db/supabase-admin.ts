import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { EngineConfig } from "../config/env.js";
import { nodeWebSocketTransport } from "./node-websocket-transport.js";

export type SupabaseAdmin = SupabaseClient;

export function createSupabaseAdmin(config: EngineConfig): SupabaseAdmin {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // Node 20 has no global WebSocket; Supabase Realtime still initializes on createClient.
    realtime: {
      transport: nodeWebSocketTransport,
    },
  });
}
