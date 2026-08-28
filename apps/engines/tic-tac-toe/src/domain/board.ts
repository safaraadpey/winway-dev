import type { Board, CellValue } from "./types";

export function createEmptyBoard(): Board {
  return [null, null, null, null, null, null, null, null, null];
}

export function cloneBoard(board: Board): Board {
  return [...board] as Board;
}

export function isValidCell(cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell <= 8;
}

export function isCellEmpty(board: Board, cell: number): boolean {
  return board[cell] === null;
}

export function setCell(board: Board, cell: number, mark: CellValue): Board {
  const next = [...board] as CellValue[];
  next[cell] = mark;
  return next as Board;
}

export function countMarks(board: Board): number {
  return board.filter((c) => c !== null).length;
}
