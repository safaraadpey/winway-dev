/**
 * Request authentication for the command API.
 *
 * The engine holds the service-role key, so it must verify the *caller's*
 * Supabase access token and act on their behalf — never trust a user id from
 * the request body. This replaces RLS/auth.uid() enforcement that the DB did
 * when the client called RPCs directly.
 */

import type { SupabaseAdmin } from "../db/supabase-admin.js";

export interface AuthedUser {
  id: string;
  role?: string;
}

export function bearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

/** Verify a Supabase JWT and return the authenticated user, or null. */
export async function verifyUser(
  supabase: SupabaseAdmin,
  token: string
): Promise<AuthedUser | null> {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, role: data.user.role ?? undefined };
}
