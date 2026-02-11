// lib/admin-permissions.ts
//
// Helper functions for checking admin permissions

import { supabase } from "@/lib/supabaseClient";
import type { AdminPermissions, AdminPermissionKey } from "@/src/types/admins";

type PermissionsCache = {
  userId: string;
  fetchedAtMs: number;
  perms: AdminPermissions;
};

let permissionsCache: PermissionsCache | null = null;

export function getCachedAdminPermissions(): AdminPermissions | null {
  return permissionsCache?.perms ?? null;
}

export function clearAdminPermissionsCache() {
  permissionsCache = null;
}

/**
 * بارگذاری دسترسی‌های admin فعلی
 */
export async function getCurrentAdminPermissions(options?: { maxAgeMs?: number; force?: boolean }): Promise<AdminPermissions | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const maxAgeMs = options?.maxAgeMs ?? 60_000;
    if (!options?.force && permissionsCache?.userId === user.id) {
      const ageMs = Date.now() - permissionsCache.fetchedAtMs;
      if (ageMs >= 0 && ageMs <= maxAgeMs) {
        return permissionsCache.perms;
      }
    }

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
      const perms: AdminPermissions = {
        rooms: true,
        users: true,
        transactions: true,
        entry_banner: true,
        admins: true,
      };
      permissionsCache = { userId: user.id, fetchedAtMs: Date.now(), perms };
      return perms;
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

    permissionsCache = { userId: user.id, fetchedAtMs: Date.now(), perms: permissions };
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

