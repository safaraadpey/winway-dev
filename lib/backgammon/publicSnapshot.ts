import type { Move } from "@dingmoney/backgammon-engine";

export type BackgammonPublicSnapshot = {
  sessionId: string;
  status: string;
  stateVersion: number;
  matchStatus: string;
  currentTurn: 0 | 1 | null;
  currentTurnSeat: "white" | "black" | null;
  board: {
    points: Array<{ white: number; black: number }>;
    bar: { white: number; black: number };
    borneOff: { white: number; black: number };
  };
  dice: {
    values: [number, number] | null;
    remaining: number[];
    rolled: boolean;
  };
  winner: 0 | 1 | null;
  winKind: string | null;
  mySeat: 0 | 1 | null;
  myUserId: string;
  players: Array<{ userId: string; seat: number; seatLabel: string }>;
  opponentUserId: string | null;
  legalMoves: Move[];
  isMyTurn: boolean;
  canRoll: boolean;
  canUndo: boolean;
};
