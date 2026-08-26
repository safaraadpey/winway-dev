// src/types/dashboard.ts
//
// Types used by admin/agent dashboards (financial overview, user info, etc.)

export type DashboardPeriod = "day" | "week" | "month" | "overall";

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

export interface DashboardPanelOperator {
  userId: string;
  displayName: string;
  role: "agent" | "super";
  /** کمیسیون همان پنل (کانیات من ایجنت/سوپر) در بازه انتخاب‌شده */
  amount: number;
  /**
   * تعداد یکتای پلیرهای زیرمجموعه که در بازه انتخاب‌شده بازی کرده‌اند
   * (از جدول روزانه operator_player_play_days).
   */
  playedPlayersCount?: number;
  /**
   * تعداد پلیرهای زیرمجموعه که الان در روم فعال هستند
   * (waiting / playing / live). لحظه‌ای است، وابسته به بازه مالی نیست.
   */
  playingPlayersCount?: number;
}

export interface FinancialSummary {
  period: DashboardPeriod;
  ticketsVolume: number; // مجموع مبلغ بلیت‌ها / فروش
  /** مجموع commission_base تیکت‌های settle‌شده (فقط کمیسیون پرداخت‌شده) */
  ticketsVolumeTotal: number;
  /** تفکیک کانیات پنل‌ها بر اساس ایجنت/سوپر */
  panelOperators?: DashboardPanelOperator[];
  /** مجموع commission_base تورنومنت‌ها */
  tournamentTicketsVolumeTotal: number;
  /** کمیسیون تورنومنت (نمایش جداگانه در داشبورد) */
  tournamentCommission: number;
  /** کانیات پلیر مستقیم ادمین (بدون ایجنت/سوپر در snapshot کمیسیون) */
  directPlayerCommission: number;
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
  /** Rooms currently in waiting / playing / live (point-in-time, not period-scoped). */
  activeRoomsCount: number;
}


