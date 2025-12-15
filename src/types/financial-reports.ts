// src/types/financial-reports.ts
//
// Types for player financial reports

export type ReportPeriod = "day" | "week" | "month";

export interface FinancialTransaction {
  id: string;
  amount: number;
  type: "deposit" | "withdraw";
  status: string;
  description?: string;
  createdAt: string;
  actorId?: string; // ID ادمین/ایجنت که تراکنش را انجام داده
  actorName?: string; // نام ادمین/ایجنت
  actorShortId?: string; // Short ID ادمین/ایجنت
  actorRole?: "admin" | "agent" | "super"; // نقش ادمین/ایجنت
}

export interface FinancialSummary {
  period: ReportPeriod;
  totalDeposits: number;
  totalWithdrawals: number;
  netBalance: number; // deposits - withdrawals
  transactionCount: number;
}

export interface GameStatistics {
  totalCardsPurchased: number; // مجموع کارت خریده شده
  totalPurchaseAmount: number; // مجموع مبلغ خرید
  lineWinsCount: number; // تعداد برد خطی
  fullWinsCount: number; // تعداد برد پر
  winRate: number; // نرخ برد (درصد)
  deposits: number; // واریزی
  withdrawals: number; // برداشت
  averageCardsPerGame: number; // میانگین کارت/بازی
}

export interface FinancialReportsData {
  summary: FinancialSummary;
  transactions: FinancialTransaction[];
  gameStats: GameStatistics;
}

