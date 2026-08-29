export const TIC_TAC_TOE_FEATURE_KEY = "tic_tac_toe";

export const TIC_TAC_TOE_PLACEMENTS = [
  "player_settings",
  "player_home",
  "player_lobby",
  "player_header",
] as const;

export type TicTacToePlacement = (typeof TIC_TAC_TOE_PLACEMENTS)[number];

export const DEFAULT_TIC_TAC_TOE_PLACEMENTS: TicTacToePlacement[] = [
  "player_settings",
];

export const TIC_TAC_TOE_OPEN_EVENT = "app:open-tic-tac-toe";

export const TIC_TAC_TOE_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type TicTacToeDifficulty = (typeof TIC_TAC_TOE_DIFFICULTIES)[number];

export const TIC_TAC_TOE_DIFFICULTY_WIN_PRIZE_DING: Record<
  TicTacToeDifficulty,
  number
> = {
  easy: 1,
  medium: 3,
  hard: 5,
};

export function getTicTacToeWinPrizeDing(
  difficulty: TicTacToeDifficulty
): number {
  return TIC_TAC_TOE_DIFFICULTY_WIN_PRIZE_DING[difficulty];
}

export const TIC_TAC_TOE_MAX_WIN_PRIZE_DING = Math.max(
  ...Object.values(TIC_TAC_TOE_DIFFICULTY_WIN_PRIZE_DING)
);

export const TIC_TAC_TOE_MILESTONE_WINS = 7;

export const TIC_TAC_TOE_HARD_MILESTONE_BONUS_DING = 20;
