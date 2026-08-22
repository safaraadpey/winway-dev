// src/types/dashboard.ts
//
// Types used by admin/agent dashboards (financial overview, user info, etc.)

export type DashboardPeriod = "day" | "week" | "month";

export interface DashboardUserInfo {
  id: string;
  /** ID کوتاه ۱۰ رقمی برای نمایش در UI (از روی UUID محاسبه می‌شود) */
  shortId: string;
  displayName: string;
  role: "admin" | "agent" | "super" | "player";
  referralCode: string | null;
  parentId?: string | null;
  adminSubRole?: "manager" | "finance" | "support" | "room" | "dev_panel" | null; // فقط برای role="admin"
}

export interface FinancialSummary {
  period: DashboardPeriod;
  ticketsVolume: number; // مجموع مبلغ بلیت‌ها / فروش
  /** مجموع commission_base تیکت‌های settle‌شده (فقط کمیسیون پرداخت‌شده) */
  ticketsVolumeTotal: number;
  /** مجموع commission_base تورنومنت‌ها */
  tournamentTicketsVolumeTotal: number;
  /** کمیسیون تورنومنت (نمایش جداگانه در داشبورد) */
  tournamentCommission: number;
  /** مبلغ پرداختی گارانتی تورنومنت‌ها (تاپ‌آپ ضمانت) */
  tournamentGuaranteePayout: number;
  /** مجموع خریدهای درگاه (deposit_domain، بدون تتر) */
  gatewayPurchases: number;
  deposits: number; // واریزها
  withdrawals: number; // برداشت‌ها
  net: number; // بیلان (deposits - withdrawals یا عدد ترکیبی)
}

export interface DashboardData {
  user: DashboardUserInfo | null;
  summaries: Record<DashboardPeriod, FinancialSummary>;
}


