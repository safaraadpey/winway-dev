import { isCellEmpty, isValidCell } from "./board";
import {
  DomainError,
  MACHINE_MARK,
  PLAYER_MARK,
  WIN_LINES,
  type Board,
  type Mark,
  type Outcome,
  type Turn,
} from "./types";

export function getLegalMoves(board: Board): number[] {
  const moves: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    if (isCellEmpty(board, i)) moves.push(i);
  }
  return moves;
}

export function getWinner(board: Board): Mark | null {
  for (const [a, b, c] of WIN_LINES) {
    const mark = board[a];
    if (mark !== null && mark === board[b] && mark === board[c]) {
      return mark;
    }
  }
  return null;
}

export function isBoardFull(board: Board): boolean {
  return board.every((cell) => cell !== null);
}

export function resolveOutcome(board: Board): Outcome {
  const winner = getWinner(board);
  if (winner === PLAYER_MARK) return "win";
  if (winner === MACHINE_MARK) return "lose";
  if (isBoardFull(board)) return "draw";
  return null;
}

export function assertLegalMove(board: Board, cell: number, expectedTurn: Turn): void {
  if (!isValidCell(cell)) {
    throw new DomainError("invalid cell", "invalid_cell");
  }
  if (!isCellEmpty(board, cell)) {
    throw new DomainError("cell occupied", "cell_occupied");
  }
  if (expectedTurn !== "player") {
    throw new DomainError("not player turn", "wrong_turn");
  }
}

export function nextTurnAfterMove(board: Board): Turn | null {
  const outcome = resolveOutcome(board);
  if (outcome !== null) return null;
  const marks = board.filter((c) => c !== null).length;
  return marks % 2 === 1 ? "machine" : "player";
}
