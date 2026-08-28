export const TIC_TAC_TOE_FEATURE_KEY = "tic_tac_toe";

export const TIC_TAC_TOE_PLACEMENTS = [
  "player_home",
  "player_lobby",
  "player_header",
] as const;

export type TicTacToePlacement = (typeof TIC_TAC_TOE_PLACEMENTS)[number];

export const DEFAULT_TIC_TAC_TOE_PLACEMENTS: TicTacToePlacement[] = ["player_home"];

export const TIC_TAC_TOE_OPEN_EVENT = "app:open-tic-tac-toe";

export const TIC_TAC_TOE_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type TicTacToeDifficulty = (typeof TIC_TAC_TOE_DIFFICULTIES)[number];
