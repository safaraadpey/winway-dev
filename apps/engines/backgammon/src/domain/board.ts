import type { Board, PointIndex, PointStack, Seat } from "./types";
import { BLACK, WHITE } from "./types";

const EMPTY_STACK: PointStack = { white: 0, black: 0 };

export function createEmptyBoard(): Board {
  const points: PointStack[] = [EMPTY_STACK];
  for (let i = 1; i <= 24; i++) {
    points.push({ white: 0, black: 0 });
  }
  return {
    points,
    bar: { white: 0, black: 0 },
    borneOff: { white: 0, black: 0 },
  };
}

/** Standard 15-checker starting layout */
export function createInitialBoard(): Board {
  const board = createEmptyBoard();
  const set = (point: PointIndex, white: number, black: number) => {
    board.points[point] = { white, black };
  };
  set(1, 0, 2);
  set(6, 5, 0);
  set(8, 3, 0);
  set(12, 0, 5);
  set(13, 5, 0);
  set(17, 0, 3);
  set(19, 0, 5);
  set(24, 2, 0);
  return board;
}

export function seatColor(seat: Seat): "white" | "black" {
  return seat === WHITE ? "white" : "black";
}

export function opponent(seat: Seat): Seat {
  return seat === WHITE ? BLACK : WHITE;
}

export function countAt(board: Board, point: PointIndex, seat: Seat): number {
  const stack = board.points[point];
  return seat === WHITE ? stack.white : stack.black;
}

export function opponentCountAt(board: Board, point: PointIndex, seat: Seat): number {
  const stack = board.points[point];
  return seat === WHITE ? stack.black : stack.white;
}

export function barCount(board: Board, seat: Seat): number {
  return seat === WHITE ? board.bar.white : board.bar.black;
}

export function borneOffCount(board: Board, seat: Seat): number {
  return seat === WHITE ? board.borneOff.white : board.borneOff.black;
}

export function totalCheckers(board: Board, seat: Seat): number {
  let total = barCount(board, seat) + borneOffCount(board, seat);
  for (let p = 1; p <= 24; p++) {
    total += countAt(board, p, seat);
  }
  return total;
}

/** White home: 1–6; black home: 19–24 */
export function isHomePoint(point: PointIndex, seat: Seat): boolean {
  return seat === WHITE ? point >= 1 && point <= 6 : point >= 19 && point <= 24;
}

export function allInHome(board: Board, seat: Seat): boolean {
  if (barCount(board, seat) > 0) return false;
  for (let p = 1; p <= 24; p++) {
    if (!isHomePoint(p, seat) && countAt(board, p, seat) > 0) {
      return false;
    }
  }
  return true;
}

export function isBlocked(board: Board, point: PointIndex, seat: Seat): boolean {
  return opponentCountAt(board, point, seat) >= 2;
}

export function isBlot(board: Board, point: PointIndex, seat: Seat): boolean {
  return opponentCountAt(board, point, seat) === 1;
}

/** Entry point from bar for a given die */
export function barEntryPoint(seat: Seat, die: number): PointIndex {
  if (die < 1 || die > 6) throw new Error("invalid die");
  return seat === WHITE ? (25 - die) : die;
}

export function directionDelta(seat: Seat): number {
  return seat === WHITE ? -1 : 1;
}

export function moveDestination(from: PointIndex, die: number, seat: Seat): number {
  return from + directionDelta(seat) * die;
}

export function highestOccupiedHomePoint(board: Board, seat: Seat): PointIndex | null {
  if (seat === WHITE) {
    for (let p = 6; p >= 1; p--) {
      if (countAt(board, p, seat) > 0) return p;
    }
  } else {
    for (let p = 19; p <= 24; p++) {
      if (countAt(board, p, seat) > 0) return p;
    }
  }
  return null;
}

export function cloneBoard(board: Board): Board {
  return {
    points: board.points.map((s) => ({ ...s })),
    bar: { ...board.bar },
    borneOff: { ...board.borneOff },
  };
}

export function serializeBoard(board: Board): Board {
  return cloneBoard(board);
}

export function deserializeBoard(board: Board): Board {
  return cloneBoard(board);
}
