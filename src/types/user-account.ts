// Types for user account detail page in admin/agent/super dashboards

import type { AdminSubRole } from "@/lib/auth-helpers";

export type UserAccountPeriod = "day" | "week" | "month" | "overall";

export interface UserAccountInfo {
  id: string;
  shortId: string;
  username: string;
  displayName: string;
  role: "admin" | "agent" | "super" | "player";
  adminSubRole: AdminSubRole | null; // فقط برای role="admin"
  parentId: string | null;
  dingBalance: number;
  tomanBalance: number;
  lastLoginAt: string | null;
  agentId: string | null;
  agentUsername: string | null;
  agentShortId: string | null;
  superId: string | null;
  superUsername: string | null;
  superShortId: string | null;
  personalNote?: string | null;
  isSuspended: boolean;
  commissionPercent: number | null; // درصد کانیات (0-100) برای agent و super
  /** مجموع موجودی تومان زیرمجموعه (فقط super/agent) */
  subordinateAssets: {
    tomanBalance: number;
  } | null;
}

export interface UserAccountActivity {
  period: UserAccountPeriod;
  gamesPlayed: number; // تعداد بازی (اتاق‌های متمایز با تیکت معتبر)
  lineWins: number; // تعداد برد خطی
  fullWins: number; // تعداد برد پر
  commission: number; // کانیات (کمیسیون)
  commissionTotal: number | null; // کانیات کل (مبنای کمیسیون) - ممکن است برای برخی نقش‌ها قابل محاسبه نباشد
  deposits: number; // واریز (درگاه + رمز ارز + شارژ پنل/ایجنت)
  withdrawals: number; // برداشت (کلیم مستقیم بالاسری + درخواست برداشت تأییدشده)
  net: number; // بیلان (واریز - برداشت)
  /**
   * مجموع برد همین کاربر (اگر پلیر باشد).
   * جوایز پرداخت‌شده اتاق‌های عادی — همان منطق سوابق لیدربورد.
   */
  playerWinnings?: number;
  /**
   * مجموع باخت/خرید همین کاربر (اگر پلیر باشد).
   * قیمت کارت بلیت‌های confirmed/consumed اتاق عادی.
   */
  playerPurchases?: number;
}

export type UserAccountActivityMetrics = Omit<UserAccountActivity, "period">;

export type UserAccountTransactionCategory =
  | "panel"
  | "gateway_deposit"
  | "crypto_deposit"
  | "withdrawal";

export interface UserAccountTransaction {
  id: string;
  amount: number;
  type: "deposit" | "withdraw";
  category: UserAccountTransactionCategory;
  title: string;
  actorRole?: "admin" | "agent" | "super";
  actorId?: string;
  actorShortId?: string;
  actorUsername?: string;
  createdAt: string;
}

export interface UserAccountData {
  user: UserAccountInfo;
  activities: Record<UserAccountPeriod, UserAccountActivity>;
  transactions: UserAccountTransaction[];
}

