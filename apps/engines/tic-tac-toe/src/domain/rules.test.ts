import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyBoard, setCell } from "./board";
import { getLegalMoves, getWinner, resolveOutcome } from "./rules";
import { MACHINE_MARK, PLAYER_MARK } from "./types";

describe("rules", () => {
  it("detects horizontal win", () => {
    let board = createEmptyBoard();
    board = setCell(board, 0, PLAYER_MARK);
    board = setCell(board, 1, PLAYER_MARK);
    board = setCell(board, 2, PLAYER_MARK);
    assert.equal(getWinner(board), PLAYER_MARK);
    assert.equal(resolveOutcome(board), "win");
  });

  it("detects draw", () => {
    const board = [
      PLAYER_MARK,
      PLAYER_MARK,
      MACHINE_MARK,
      MACHINE_MARK,
      MACHINE_MARK,
      PLAYER_MARK,
      PLAYER_MARK,
      MACHINE_MARK,
      MACHINE_MARK,
    ] as const;
    assert.equal(getWinner(board), null);
    assert.equal(resolveOutcome(board), "draw");
  });

  it("lists legal moves on empty board", () => {
    assert.deepEqual(getLegalMoves(createEmptyBoard()), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
