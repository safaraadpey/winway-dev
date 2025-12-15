// services/admins.ts
//
// Service helpers برای صفحه مدیریت مدیران

import { supabase } from "@/lib/supabaseClient";
import type {
  AdminSummary,
  AdminSubRoleFilter,
  AdminsListResult,
  AdminPermissionKey,
  AdminPermissions,
} from "@/src/types/admins";
import type { AdminSubRole } from "@/lib/auth-helpers";

// تبدیل UUID به ID ده‌رقمی
function makeShortIdFromUuid(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(31, hash) + id.charCodeAt(i);
  }
  const num = (hash >>> 0) % 1_000_000_0000; // 10^10
  return num.toString().padStart(10, "0");
}

export interface LoadAdminsParams {
  subRoleFilter?: AdminSubRoleFilter;
  search?: string;
}

/**
 * بارگذاری لیست مدیران
 * فقط کاربران با role='admin' را برمی‌گرداند
 */
export async function loadAdmins(
  params: LoadAdminsParams = {}
): Promise<AdminsListResult> {
  try {
    const { subRoleFilter = "all", search = "" } = params;

    // کاربر فعلی را می‌گیریم تا خودش در لیست دیده نشود
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    // ساخت query برای فیلتر role='admin'
    let query = supabase
      .from("users")
      .select("id, username, email, status, last_login_at, created_at, admin_sub_role")
      .eq("role", "admin");

    // حذف اکانت فعلی از لیست
    if (currentUser?.id) {
      query = query.neq("id", currentUser.id);
    }

    // فیلتر بر اساس admin_sub_role
    if (subRoleFilter !== "all") {
      if (subRoleFilter === "manager") {
        // مدیر کل = admin_sub_role IS NULL
        query = query.is("admin_sub_role", null);
      } else {
        // سایر sub_role ها
        query = query.eq("admin_sub_role", subRoleFilter);
      }
    }

    const { data: usersData, error: usersError } = await query.order("created_at", {
      ascending: false,
    });

    if (usersError) {
      console.error("loadAdmins: users error", usersError);
      return { admins: [], totalCount: 0 };
    }

    // فیلتر بر اساس search (client-side)
    let filteredUsers = usersData || [];
    if (search.trim()) {
      const searchLower = search.toLowerCase().trim();
      filteredUsers = filteredUsers.filter((user: any) => {
        const username = (user.username || "").toLowerCase();
        const email = (user.email || "").toLowerCase();
        const shortId = makeShortIdFromUuid(user.id);
        const searchId = searchLower.replace(/-/g, "");

        return (
          username.includes(searchLower) ||
          email.includes(searchLower) ||
          shortId.includes(searchId) ||
          user.id.toLowerCase().includes(searchLower)
        );
      });
    }

    // گرفتن دسترسی‌های همه مدیران
    const adminIds = filteredUsers.map((u: any) => u.id);
    const permissionsMap = new Map<string, AdminPermissions>();

    if (adminIds.length > 0) {
      const { data: permissionsData, error: permissionsError } = await supabase
        .from("admin_permissions")
        .select("admin_id, permission_key, granted")
        .in("admin_id", adminIds);

      if (!permissionsError && permissionsData) {
        // گروه‌بندی دسترسی‌ها بر اساس admin_id
        for (const perm of permissionsData) {
          const adminId = perm.admin_id;
          if (!permissionsMap.has(adminId)) {
            // پیش‌فرض: همه دسترسی‌ها true (اگر permission وجود نداشته باشد)
            permissionsMap.set(adminId, {
              rooms: true,
              users: true,
              transactions: true,
              entry_banner: true,
              admins: true,
            });
          }
          const perms = permissionsMap.get(adminId)!;
          const key = perm.permission_key as AdminPermissionKey;
          if (key in perms) {
            perms[key] = perm.granted;
          }
        }
      }
    }

    // تبدیل به AdminSummary
    const admins: AdminSummary[] = filteredUsers.map((user: any) => {
      const adminId = user.id;
      const permissions = permissionsMap.get(adminId) || {
        rooms: true,
        users: true,
        transactions: true,
        entry_banner: true,
        admins: true,
      };

      return {
        id: adminId,
        shortId: makeShortIdFromUuid(adminId),
        username: user.username || "نامشخص",
        email: user.email || null,
        adminSubRole: (user.admin_sub_role as AdminSubRole) || null,
        status: user.status as "active" | "suspended" | "deleted",
        lastLoginAt: user.last_login_at || null,
        createdAt: user.created_at,
        permissions,
      };
    });

    return {
      admins,
      totalCount: admins.length,
    };
  } catch (err) {
    console.error("loadAdmins unexpected error:", err);
    return { admins: [], totalCount: 0 };
  }
}

/**
 * تغییر admin_sub_role یک مدیر
 * فقط مدیر کل می‌تواند این کار را انجام دهد
 * 
 * [MIGRATED_TO_ADMIN_API_PHASE_4] - این تابع اکنون از Admin API استفاده می‌کند
 */
export async function changeAdminSubRole(
  adminId: string,
  newSubRole: AdminSubRole | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // استفاده از Admin API به جای direct database access
    const { setAdminSubRole } = await import('@/lib/adminApiClient');
    
    // فراخوانی Admin API
    await setAdminSubRole(adminId, newSubRole);

    return { success: true };
  } catch (err: any) {
    console.error("changeAdminSubRole unexpected error:", err);
    
    // تبدیل AdminApiError به فرمت قدیمی
    if (err.code) {
      return { success: false, error: err.message || "خطا در تغییر نقش مدیر" };
    }
    
    return { success: false, error: "خطای غیرمنتظره" };
  }
}

/**
 * تعلیق یا فعال‌سازی مدیر
 * فقط مدیر کل می‌تواند این کار را انجام دهد
 * 
 * [MIGRATED_TO_ADMIN_API_PHASE_4] - این تابع اکنون از Admin API استفاده می‌کند
 */
export async function toggleAdminStatus(
  adminId: string
): Promise<{ success: boolean; newStatus: "active" | "suspended" | null; error?: string }> {
  try {
    // استفاده از Admin API به جای direct database access
    const { toggleAdminStatus: apiToggle } = await import('@/lib/adminApiClient');
    
    // گرفتن وضعیت فعلی مدیر برای برگرداندن newStatus
    const { data: adminData, error: adminError } = await supabase
      .from("users")
      .select("status")
      .eq("id", adminId)
      .eq("role", "admin")
      .single();

    if (adminError || !adminData) {
      console.error("toggleAdminStatus: admin error", adminError);
      return { success: false, newStatus: null, error: "خطا در دریافت اطلاعات مدیر" };
    }

    const currentStatus = adminData.status as "active" | "suspended" | "deleted";
    const expectedNewStatus: "active" | "suspended" =
      currentStatus === "suspended" ? "active" : "suspended";

    // فراخوانی Admin API
    await apiToggle(adminId);

    return { success: true, newStatus: expectedNewStatus };
  } catch (err: any) {
    console.error("toggleAdminStatus unexpected error:", err);
    
    // تبدیل AdminApiError به فرمت قدیمی
    if (err.code) {
      return { success: false, newStatus: null, error: err.message || "خطا در تغییر وضعیت مدیر" };
    }
    
    return { success: false, newStatus: null, error: "خطای غیرمنتظره" };
  }
}

/**
 * حذف نرم (soft delete) مدیر:
 * - فقط مدیر کل می‌تواند این کار را انجام دهد
 * - status مدیر به 'deleted' تغییر می‌کند
 * - برای سادگی، رکورد در دیتابیس باقی می‌ماند تا تاریخچه حفظ شود
 */
export async function deleteAdmin(
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // بررسی اینکه کاربر فعلی مدیر کل است
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (!currentUser) {
      return { success: false, error: "خطا در احراز هویت" };
    }

    const { data: currentUserData, error: currentUserError } = await supabase
      .from("users")
      .select("role, admin_sub_role")
      .eq("id", currentUser.id)
      .single();

    if (currentUserError || !currentUserData) {
      console.error("deleteAdmin: current user error", currentUserError);
      return {
        success: false,
        error: "خطا در دریافت اطلاعات کاربر فعلی",
      };
    }

    // فقط مدیر کل (admin با admin_sub_role = null) می‌تواند حذف کند
    if (
      currentUserData.role !== "admin" ||
      currentUserData.admin_sub_role !== null
    ) {
      return {
        success: false,
        error: "فقط مدیر کل می‌تواند مدیران را حذف کند",
      };
    }

    // به‌روزرسانی status به deleted
    const { error: updateError } = await supabase
      .from("users")
      .update({ status: "deleted" })
      .eq("id", adminId)
      .eq("role", "admin");

    if (updateError) {
      console.error("deleteAdmin: update error", updateError);
      return { success: false, error: "خطا در حذف مدیر" };
    }

    return { success: true };
  } catch (err) {
    console.error("deleteAdmin unexpected error:", err);
    return { success: false, error: "خطای غیرمنتظره" };
  }
}

/**
 * بارگذاری دسترسی‌های یک admin
 */
export async function loadAdminPermissions(
  adminId: string
): Promise<AdminPermissions> {
  try {
    const { data: permissionsData, error: permissionsError } = await supabase
      .from("admin_permissions")
      .select("permission_key, granted")
      .eq("admin_id", adminId);

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
    console.error("loadAdminPermissions unexpected error:", err);
    // در صورت خطا، همه دسترسی‌ها را true برمی‌گردانیم
    return {
      rooms: true,
      users: true,
      transactions: true,
      entry_banner: true,
      admins: true,
    };
  }
}

/**
 * به‌روزرسانی دسترسی‌های یک admin
 * فقط مدیر کل می‌تواند این کار را انجام دهد
 */
export async function updateAdminPermissions(
  adminId: string,
  permissions: Partial<AdminPermissions>
): Promise<{ success: boolean; error?: string }> {
  try {
    // بررسی اینکه کاربر فعلی مدیر کل است
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      return { success: false, error: "خطا در احراز هویت" };
    }

    const { data: currentUserData, error: currentUserError } = await supabase
      .from("users")
      .select("role, admin_sub_role")
      .eq("id", currentUser.id)
      .single();

    if (currentUserError || !currentUserData) {
      console.error("updateAdminPermissions: current user error", currentUserError);
      return { success: false, error: "خطا در دریافت اطلاعات کاربر فعلی" };
    }

    // فقط مدیر کل می‌تواند دسترسی‌ها را تغییر دهد
    if (
      currentUserData.role !== "admin" ||
      currentUserData.admin_sub_role !== null
    ) {
      return {
        success: false,
        error: "فقط مدیر کل می‌تواند دسترسی‌های مدیران را تغییر دهد",
      };
    }

    // به‌روزرسانی دسترسی‌ها
    const updates = Object.entries(permissions).map(([key, granted]) => ({
      admin_id: adminId,
      permission_key: key,
      granted: granted ?? true,
    }));

    // حذف دسترسی‌های قدیمی و اضافه کردن جدید
    const { error: deleteError } = await supabase
      .from("admin_permissions")
      .delete()
      .eq("admin_id", adminId)
      .in("permission_key", Object.keys(permissions) as AdminPermissionKey[]);

    if (deleteError) {
      console.error("updateAdminPermissions: delete error", deleteError);
      return { success: false, error: "خطا در حذف دسترسی‌های قدیمی" };
    }

    if (updates.length > 0) {
      const { error: insertError } = await supabase
        .from("admin_permissions")
        .insert(updates);

      if (insertError) {
        console.error("updateAdminPermissions: insert error", insertError);
        return { success: false, error: "خطا در افزودن دسترسی‌های جدید" };
      }
    }

    return { success: true };
  } catch (err) {
    console.error("updateAdminPermissions unexpected error:", err);
    return { success: false, error: "خطای غیرمنتظره" };
  }
}
