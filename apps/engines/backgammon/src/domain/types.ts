/** 0 = white, 1 = black */
export type Seat = 0 | 1;

export const WHITE: Seat = 0;
export const BLACK: Seat = 1;

/** Board point index 1–24 */
export type PointIndex = number;

export type PointStack = {
  white: number;
  black: number;
};

export type Board = {
  /** points[1] … points[24] */
  points: PointStack[];
  bar: { white: number; black: number };
  borneOff: { white: number; black: number };
};

export type DicePair = [number, number];

export type DiceState = {
  values: DicePair | null;
  /** Remaining die pips to consume this turn (doubles → 4 entries) */
  remaining: number[];
  rolled: boolean;
};

export type GameStatus = "waiting" | "running" | "finished";

export type WinKind = "single" | "gammon" | "backgammon";

export type PlayerSlot = {
  userId: string;
  seat: Seat;
};

export type MatchState = {
  sessionId: string;
  status: GameStatus;
  players: PlayerSlot[];
  currentTurn: Seat | null;
  board: Board;
  dice: DiceState;
  winner: Seat | null;
  winKind: WinKind | null;
};

export type MoveEndpoint = "bar" | "off" | PointIndex;

export type Move = {
  from: MoveEndpoint;
  to: MoveEndpoint;
  dieUsed: number;
};

export type DomainEvent =
  | { type: "game_created"; sessionId: string; creatorSeat: Seat }
  | { type: "player_joined"; userId: string; seat: Seat }
  | { type: "game_started"; startingSeat: Seat }
  | { type: "dice_rolled"; values: DicePair; seat: Seat }
  | { type: "move_made"; move: Move; seat: Seat; hit: boolean }
  | { type: "turn_ended"; previousSeat: Seat; nextSeat: Seat }
  | { type: "game_finished"; winner: Seat; winKind: WinKind };

export type ApplicationResult = {
  state: MatchState;
  events: DomainEvent[];
};

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "DomainError";
  }
}
