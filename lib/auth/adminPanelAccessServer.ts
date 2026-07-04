import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canAccessAdminPanel,
  type AdminSubRole,
  type UserRole,
} from "@/lib/auth/adminPanelRules";

export type ServerUserRoleInfo = {
  role: UserRole;
  admin_sub_role: AdminSubRole | null;
};

export class AdminPanelAccessError extends Error {
  constructor(
    public code: "UNAUTHORIZED" | "FORBIDDEN" | "FORBIDDEN_DEV_PANEL",
    message: string
  ) {
    super(message);
    this.name = "AdminPanelAccessError";
  }
}

export async function getServerUserRoleInfo(
  userId: string
): Promise<ServerUserRoleInfo | null> {
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

export async function assertAdminPanelAccess(userId: string): Promise<void> {
  const roleInfo = await getServerUserRoleInfo(userId);
  if (!roleInfo) {
    throw new AdminPanelAccessError("UNAUTHORIZED", "Session required");
  }

  if (canAccessAdminPanel(roleInfo.role, roleInfo.admin_sub_role)) {
    return;
  }

  if (roleInfo.role === "admin") {
    throw new AdminPanelAccessError("FORBIDDEN_DEV_PANEL", "Dev panel access required");
  }

  throw new AdminPanelAccessError("FORBIDDEN", "Admin panel access required");
}
