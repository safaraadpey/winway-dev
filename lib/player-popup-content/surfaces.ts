/** Known surface keys — extend freely; not an exhaustive union. */
export const PLAYER_POPUP_SURFACE = {
  TIC_TAC_TOE: "tic_tac_toe",
  TOURNAMENT_BREAK: "tournament_break",
  GLOBAL_PLAYER_POPUP: "global_player_popup",
} as const;

export type PlayerPopupSurfaceKey =
  (typeof PLAYER_POPUP_SURFACE)[keyof typeof PLAYER_POPUP_SURFACE];
