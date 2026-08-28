import { TIC_TAC_TOE_OPEN_EVENT } from "@/lib/tic-tac-toe/constants";

export function openTicTacToeModal(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TIC_TAC_TOE_OPEN_EVENT));
}
