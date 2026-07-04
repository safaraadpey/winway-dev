import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

const { url, anonKey } = getSupabasePublicEnv();

// Cookie-backed browser client; pairs with lib/supabase/server.ts + middleware refresh.
export const supabase: SupabaseClient = createBrowserClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

export function createSupabaseClient() {
  return supabase;
}

export function getSupabaseClient() {
  return supabase;
}
