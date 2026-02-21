export type TournamentReportPeriod = "day" | "week" | "month" | "range";

export interface TournamentReportItem {
  id: string;
  title: string;
  status: string;
  startAt: string | null;
  finishedAt: string | null;
  currency: string | null;
  ticketPrice: number;
  guaranteedPrize: number;
  entriesCount: number;
  ticketsCount: number;
  entriesAmount: number;
  commissionBase: number;
  poolAmount: number;
  prizePaid: number;
  guaranteeTopup: number;
  myCommission: number;
  winnerNames: string[];
}

export interface TournamentReportResult {
  items: TournamentReportItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  viewerRole: "admin" | "agent" | "super";
}

export interface LoadTournamentReportParams {
  period: TournamentReportPeriod;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  maxAgeMs?: number;
  force?: boolean;
}
