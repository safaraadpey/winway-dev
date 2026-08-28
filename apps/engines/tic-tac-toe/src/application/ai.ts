import { setCell } from "../domain/board";
import { getLegalMoves, getWinner } from "../domain/rules";
import {
  MACHINE_MARK,
  PLAYER_MARK,
  type Board,
  type Difficulty,
  type Mark,
} from "../domain/types";
import { createTurnRng, pickRandomIndex } from "../infrastructure/seededRng";

type Score = -1 | 0 | 1;

function evaluateBoard(board: Board, forMark: Mark): Score {
  const winner = getWinner(board);
  if (winner === forMark) return 1;
  if (winner !== null) return -1;
  if (getLegalMoves(board).length === 0) return 0;
  return 0;
}

function minimax(
  board: Board,
  current: Mark,
  aiMark: Mark,
  alpha: number,
  beta: number
): Score {
  const winner = getWinner(board);
  if (winner !== null || getLegalMoves(board).length === 0) {
    return evaluateBoard(board, aiMark);
  }

  const moves = getLegalMoves(board);
  if (current === aiMark) {
    let best = -Infinity as number;
    for (const cell of moves) {
      const next = setCell(board, cell, current);
      best = Math.max(best, minimax(next, current === PLAYER_MARK ? MACHINE_MARK : PLAYER_MARK, aiMark, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best as Score;
  }

  let best = Infinity as number;
  for (const cell of moves) {
    const next = setCell(board, cell, current);
    best = Math.min(best, minimax(next, current === PLAYER_MARK ? MACHINE_MARK : PLAYER_MARK, aiMark, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best as Score;
}

function findBestMove(board: Board, aiMark: Mark): number {
  const moves = getLegalMoves(board);
  if (moves.length === 0) return -1;

  const opponent: Mark = aiMark === PLAYER_MARK ? MACHINE_MARK : PLAYER_MARK;
  let bestCell = moves[0];
  let bestScore = -Infinity as number;

  for (const cell of moves) {
    const next = setCell(board, cell, aiMark);
    const score = minimax(next, opponent, aiMark, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      bestCell = cell;
    }
  }

  return bestCell;
}

function findBlockingOrWinningMove(board: Board, mark: Mark): number | null {
  for (const cell of getLegalMoves(board)) {
    const next = setCell(board, cell, mark);
    if (getWinner(next) === mark) return cell;
  }
  return null;
}

export function pickMachineMove(
  board: Board,
  difficulty: Difficulty,
  seed: string,
  machineMoveIndex: number
): number {
  const legal = getLegalMoves(board);
  if (legal.length === 0) return -1;

  const rng = createTurnRng(seed, machineMoveIndex);

  if (difficulty === "hard") {
    return findBestMove(board, MACHINE_MARK);
  }

  const optimalChance = difficulty === "medium" ? 0.7 : 0.3;

  if (rng() < optimalChance) {
    const winMove = findBlockingOrWinningMove(board, MACHINE_MARK);
    if (winMove !== null) return winMove;

    const blockMove = findBlockingOrWinningMove(board, PLAYER_MARK);
    if (blockMove !== null) return blockMove;

    if (difficulty === "medium") {
      return findBestMove(board, MACHINE_MARK);
    }

    if (board[4] === null && legal.includes(4)) return 4;
    const corners = [0, 2, 6, 8].filter((c) => legal.includes(c));
    if (corners.length > 0) {
      return corners[pickRandomIndex(rng, corners.length)]!;
    }
  }

  return legal[pickRandomIndex(rng, legal.length)]!;
}
