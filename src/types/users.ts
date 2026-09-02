// Types for managed users list in admin/agent/super dashboards
// این types برای صفحه «مدیریت کاربران» استفاده می‌شود.

export type ManagedUserRole = "admin" | "agent" | "super" | "player";

export type ManagedUserRoleFilter = "all" | "agent" | "super" | "player";

export interface ManagedUserSummary {
  id: string; // UUID اصلی کاربر
  shortId: string; // ID ده رقمی برای نمایش سریع در UI
  username: string;
  nickname: string | null;
  displayName: string;
  role: ManagedUserRole;
  tomanBalance: number;
  /**
   * تعداد کاربران زیرمجموعه این کاربر در نمای مدیریت کاربران
   * - برای ایجنت: تعداد پلیرهای زیرمجموعه
   * - برای سوپر: تعداد ایجنت‌ها و پلیرهای زیرمجموعه
   * - برای پلیر و ادمین معمولاً 0 است
   */
  managedUserCount?: number;
  /**
   * بالاسری مستقیم این کاربر در نمای مدیریت کاربران
   * - برای پلیر معمولاً ایجنت است (و در صورت نبود، سوپر)
   * - برای ایجنت معمولاً سوپر است
   * - برای سوپر و ادمین معمولاً null است (ریشه درخت)
   */
  parentUserId: string | null;
  /** نام ایجنت بالاسری (برای پلیر) */
  agentUsername: string | null;
  /** نام سوپر بالاسری (برای پلیر / ایجنت) */
  superUsername: string | null;
}

export interface ManagedUserRoleTotals {
  all: number;
  player: number;
  agent: number;
  super: number;
}

export interface ManagedUsersResult {
  currentUserRole: ManagedUserRole;
  users: ManagedUserSummary[];
  totalCount: number;
  roleTotals?: ManagedUserRoleTotals;
}


