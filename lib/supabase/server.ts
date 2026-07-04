import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * User-scoped Supabase client for Server Components and layouts.
 * Uses the anon key + request cookies only (never service role).
 */
export function createSupabaseServerClient(): SupabaseClient {
  const { url, anonKey } = getSupabasePublicEnv();
  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components may run in a read-only cookie context;
          // middleware refresh keeps auth cookies up to date.
        }
      },
    },
  });
}
