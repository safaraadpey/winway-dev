// lib/admin-permissions.ts
//
// Helper functions for checking admin permissions

import { supabase } from "@/lib/supabaseClient";
import type { AdminPermissions, AdminPermissionKey } from "@/src/types/admins";

/**
 * بارگذاری دسترسی‌های admin فعلی
 */
export async function getCurrentAdminPermissions(): Promise<AdminPermissions | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role, admin_sub_role")
      .eq("id", user.id)
      .single();

    if (userError || !userData || userData.role !== "admin") {
      return null;
    }

    // مدیر کل (admin_sub_role IS NULL) همه دسترسی‌ها را دارد
    if (userData.admin_sub_role === null) {
      return {
        rooms: true,
        users: true,
        transactions: true,
        entry_banner: true,
        admins: true,
      };
    }

    // بارگذاری دسترسی‌های از دیتابیس
    const { data: permissionsData, error: permissionsError } = await supabase
      .from("admin_permissions")
      .select("permission_key, granted")
      .eq("admin_id", user.id);

    // پیش‌فرض: همه دسترسی‌ها true
    const permissions: AdminPermissions = {
      rooms: true,
      users: true,
      transactions: true,
      entry_banner: true,
      admins: true,
    };

    if (!permissionsError && permissionsData) {
      for (const perm of permissionsData) {
        const key = perm.permission_key as AdminPermissionKey;
        if (key in permissions) {
          permissions[key] = perm.granted;
        }
      }
    }

    return permissions;
  } catch (err) {
    console.error("getCurrentAdminPermissions unexpected error:", err);
    return null;
  }
}

/**
 * بررسی اینکه آیا admin فعلی به یک permission دسترسی دارد
 */
export async function hasPermission(permissionKey: AdminPermissionKey): Promise<boolean> {
  const permissions = await getCurrentAdminPermissions();
  if (!permissions) return false;
  return permissions[permissionKey] === true;
}

