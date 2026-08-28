/** Player is X, machine is O */
export type Mark = "X" | "O";

export type CellValue = Mark | null;

export type Board = readonly [
  CellValue,
  CellValue,
  CellValue,
  CellValue,
  CellValue,
  CellValue,
  CellValue,
  CellValue,
  CellValue,
];

export type Difficulty = "easy" | "medium" | "hard";

export type Turn = "player" | "machine";

export type Outcome = "win" | "lose" | "draw" | null;

export type GameStatus = "playing" | "finished";

export type MatchState = {
  board: Board;
  status: GameStatus;
  currentTurn: Turn;
  outcome: Outcome;
  moveCount: number;
  seed: string;
  difficulty: Difficulty;
};

export type PlayerMove = {
  cell: number;
  by: "player";
};

export type MachineMove = {
  cell: number;
  by: "machine";
};

export type MoveRecord = PlayerMove | MachineMove;

export type ApplicationResult = {
  state: MatchState;
  events: DomainEvent[];
};

export type DomainEvent =
  | { type: "game_created"; seed: string; difficulty: Difficulty }
  | { type: "move_played"; cell: number; by: Mark }
  | { type: "game_finished"; outcome: Exclude<Outcome, null> };

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const WIN_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export const PLAYER_MARK: Mark = "X";
export const MACHINE_MARK: Mark = "O";
