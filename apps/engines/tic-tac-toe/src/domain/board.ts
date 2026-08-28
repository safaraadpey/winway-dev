import type { Board, CellValue } from "./types";

export function createEmptyBoard(): Board {
  return [null, null, null, null, null, null, null, null, null];
}

export function cloneBoard(board: Board): Board {
  return [
    board[0],
    board[1],
    board[2],
    board[3],
    board[4],
    board[5],
    board[6],
    board[7],
    board[8],
  ];
}

export function isValidCell(cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell <= 8;
}

export function isCellEmpty(board: Board, cell: number): boolean {
  return board[cell] === null;
}

export function setCell(board: Board, cell: number, mark: CellValue): Board {
  return [
    cell === 0 ? mark : board[0],
    cell === 1 ? mark : board[1],
    cell === 2 ? mark : board[2],
    cell === 3 ? mark : board[3],
    cell === 4 ? mark : board[4],
    cell === 5 ? mark : board[5],
    cell === 6 ? mark : board[6],
    cell === 7 ? mark : board[7],
    cell === 8 ? mark : board[8],
  ];
}

export function countMarks(board: Board): number {
  return board.filter((c) => c !== null).length;
}
