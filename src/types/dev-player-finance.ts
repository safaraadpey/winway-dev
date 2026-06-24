export type DevPlayerFinancePeriod = "day" | "week" | "month";

export interface DevPlayerFinanceSummary {
  period: DevPlayerFinancePeriod;
  periodLabel: string;
  from: string;
  to: string;
  devPlayerCount: number;
  cardsPurchased: number;
  totalPurchaseAmount: number;
  totalWinAmount: number;
  totalCommissionAmount: number;
  totalLossAmount: number;
  currency: string;
}

export interface DevPlayerFinanceReportResult {
  summaries: DevPlayerFinanceSummary[];
}
