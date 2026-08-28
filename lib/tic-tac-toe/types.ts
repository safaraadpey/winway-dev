import type { TicTacToeDifficulty, TicTacToePlacement } from "./constants";

export type TicTacToeSettings = {
  isEnabled: boolean;
  winPrizeDing: number;
  dailyWinCap: number;
  placements: TicTacToePlacement[];
};

export type TicTacToePublicSettings = TicTacToeSettings & {
  featureEnabled: boolean;
};

export type StartMatchResult = {
  matchId: string;
  seed: string;
  difficulty: TicTacToeDifficulty;
  winPrizeDing: number;
};

export type ClaimMatchResult = {
  matchId: string;
  outcome: "win" | "lose" | "draw";
  paidDing: number;
  alreadyClaimed: boolean;
};

export type MatchRow = {
  id: string;
  user_id: string;
  seed: string;
  difficulty: TicTacToeDifficulty;
  prize_snapshot: number;
  status: "pending" | "claimed" | "rejected";
  player_moves: number[] | null;
  outcome: "win" | "lose" | "draw" | null;
  paid_ding: number;
  paid_at: string | null;
  claim_error: string | null;
  created_at: string;
  claimed_at: string | null;
};
