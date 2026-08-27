import type { DashboardPeriod } from "@/src/types/dashboard";

export type OperatorPlayerGameRole = "agent" | "super";

export type PlayerGamePerformance = {
  playerWinnings: number;
  playerPurchases: number;
  /** Distinct normal rooms with confirmed/consumed tickets. */
  gamesPlayed: number;
};

export type OperatorPlayerGamePerformanceByPeriod = Record<
  DashboardPeriod,
  PlayerGamePerformance
>;

export function emptyPlayerGamePerformance(): PlayerGamePerformance {
  return { playerWinnings: 0, playerPurchases: 0, gamesPlayed: 0 };
}

export function emptyOperatorPlayerGamePerformanceByPeriod(): OperatorPlayerGamePerformanceByPeriod {
  return {
    day: emptyPlayerGamePerformance(),
    week: emptyPlayerGamePerformance(),
    month: emptyPlayerGamePerformance(),
    overall: emptyPlayerGamePerformance(),
  };
}
