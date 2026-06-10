// Types for admins management page

import type { AdminSubRole } from "@/lib/auth-helpers";

export interface AdminSummary {
  id: string;
  shortId: string;
  username: string;
  email: string | null;
  adminSubRole: AdminSubRole | null; // null = مدیر کل
  status: "active" | "suspended" | "deleted";
  lastLoginAt: string | null;
  createdAt: string;
  permissions?: AdminPermissions; // دسترسی‌های admin
}

export type AdminSubRoleFilter = "all" | "manager" | "finance" | "support" | "room" | "dev_panel";

export interface AdminsListResult {
  admins: AdminSummary[];
  totalCount: number;
}

// کلیدهای دسترسی
export type AdminPermissionKey = "rooms" | "users" | "transactions" | "entry_banner" | "admins";

// دسترسی‌های یک admin
export interface AdminPermissions {
  rooms: boolean;
  users: boolean;
  transactions: boolean;
  entry_banner: boolean;
  admins: boolean;
}

// لیبل‌های دسترسی‌ها
export const PERMISSION_LABELS: Record<AdminPermissionKey, string> = {
  rooms: "اتاق ها",
  users: "کاربران",
  transactions: "تراکنش ها",
  entry_banner: "بنر ورودی",
  admins: "مدیران",
};

