import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canAccessAdminPanel } from "@/lib/auth/adminPanelRules";
import { getServerUserRoleInfo } from "@/lib/auth/adminPanelAccessServer";

/**
 * Server-side admin panel gate. Mirrors AdminPanelAuthGuard redirect rules,
 * except unauthenticated users go to /admin/login (admin portal entry).
 */
export async function requireAdminPanelAccess(): Promise<void> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/admin/login");
  }

  const roleInfo = await getServerUserRoleInfo(user.id);
  if (!roleInfo) {
    redirect("/admin/login");
  }

  if (canAccessAdminPanel(roleInfo.role, roleInfo.admin_sub_role)) {
    return;
  }

  if (roleInfo.role === "admin") {
    redirect("/dev-panel/dashboard");
  }

  redirect("/admin/login");
}
