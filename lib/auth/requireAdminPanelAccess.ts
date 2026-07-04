import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canAccessAdminPanel,
  type AdminSubRole,
  type UserRole,
} from "@/lib/auth/adminPanelRules";

type ServerUserRoleInfo = {
  role: UserRole;
  admin_sub_role: AdminSubRole | null;
};

async function getServerUserRoleInfo(userId: string): Promise<ServerUserRoleInfo | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("users")
    .select("role, admin_sub_role")
    .eq("id", userId)
    .single();

  if (error) {
    if (
      (error as { code?: string }).code === "42703" ||
      error.message?.includes("admin_sub_role")
    ) {
      const { data: roleOnly, error: roleError } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();

      if (roleError || !roleOnly) {
        return null;
      }

      return {
        role: roleOnly.role as UserRole,
        admin_sub_role: null,
      };
    }

    return null;
  }

  if (!data) {
    return null;
  }

  return {
    role: data.role as UserRole,
    admin_sub_role: (data as { admin_sub_role?: AdminSubRole | null }).admin_sub_role ?? null,
  };
}

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
