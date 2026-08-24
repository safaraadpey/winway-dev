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
  fullWinnerNames: string[];
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

/** Player-facing game session row (last-24h rolling window on /api/player/games/report). */
export interface PlayerGameReportItem {
  id: string;
  roomId: string;
  roomTitle: string;
  roomCode: string | null;
  roomAmount: number;
  myTicketsCount: number;
  playedAt: string;
  lineWinsCount: number;
  fullWinsCount: number;
  totalReward: number;
  lineReward: number;
  fullReward: number;
  myTotalReward: number;
  myLineReward: number;
  myFullReward: number;
  fullWinnerNames: string[];
  lineWinnerNames: string[];
}

export interface PlayerGamesReportResult {
  items: PlayerGameReportItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  windowFrom: string;
  windowTo: string;
}

export interface LoadPlayerGamesReportParams {
  page?: number;
  pageSize?: number;
  maxAgeMs?: number;
  force?: boolean;
}

