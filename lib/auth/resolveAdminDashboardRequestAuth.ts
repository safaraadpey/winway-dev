import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createUserClientFromAccessToken,
  getVerifiedUserAndTokenFromRequestOrThrow,
} from "@/lib/supabaseServer";
import { AdminPanelAccessError } from "@/lib/auth/adminPanelAccessServer";

export async function resolveAdminDashboardRequestAuth(request: Request): Promise<{
  userId: string;
  supabase: SupabaseClient;
}> {
  const authHeader =
    request.headers.get("authorization") ?? request.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const { user, accessToken } = await getVerifiedUserAndTokenFromRequestOrThrow(request);
    return {
      userId: user.id,
      supabase: createUserClientFromAccessToken(accessToken),
    };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AdminPanelAccessError("UNAUTHORIZED", "Session required");
  }

  return {
    userId: user.id,
    supabase,
  };
}
