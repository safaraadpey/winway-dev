import { supabase } from "@/lib/supabaseClient";

/** Fire-and-forget sign out — avoids blocking UI on slow auth/realtime teardown. */
export function signOutInBackground(): void {
  void supabase.auth.signOut().catch(() => {});
}
