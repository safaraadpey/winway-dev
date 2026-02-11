// Types for user account detail page in admin/agent/super dashboards

import type { AdminSubRole } from "@/lib/auth-helpers";

export type UserAccountPeriod = "day" | "week" | "month";

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
}

export interface UserAccountActivity {
  period: UserAccountPeriod;
  lineWins: number; // تعداد برد خطی
  fullWins: number; // تعداد برد پر
  commission: number; // کانیات (کمیسیون)
  deposits: number; // واریز
  withdrawals: number; // برداشت
  net: number; // بیلان
}

export interface UserAccountTransaction {
  id: string;
  amount: number;
  type: "deposit" | "withdraw";
  actorRole: "admin" | "agent" | "super";
  actorId: string;
  actorShortId: string;
  actorUsername: string;
  createdAt: string;
}

export interface UserAccountData {
  user: UserAccountInfo;
  activities: Record<UserAccountPeriod, UserAccountActivity>;
  transactions: UserAccountTransaction[];
}

