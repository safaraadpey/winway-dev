export type GamesReportPeriod = "day" | "week" | "month" | "range";

export interface AdminGameReportItem {
  id: string;
  roomId: string;
  roomTitle: string;
  roomCode: string | null;
  roomAmount: number;
  ticketsCount: number;
  commissionRatePercent: number;
  playedAt: string;
  lineWinsCount: number;
  fullWinsCount: number;
  totalReward: number;
  lineReward: number;
  fullReward: number;
  winnerNames: string[];
  lineWinnerNames: string[];
}

export interface AdminGamesReportResult {
  items: AdminGameReportItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface LoadAdminGamesReportParams {
  period: GamesReportPeriod;
  from?: string; // YYYY-MM-DD when period=range
  to?: string; // YYYY-MM-DD when period=range
  page?: number;
  pageSize?: number;
  maxAgeMs?: number;
  force?: boolean;
}

