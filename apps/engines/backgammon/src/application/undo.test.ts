import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createGame,
  joinGame,
  rollDice,
  makeMove,
  undoLast,
  canUndo,
} from "../application/game";
import { getLegalMoves } from "../domain/rules";
import type { MatchState } from "../domain/types";
import { WHITE } from "../domain/types";
import { setRolledDice } from "../domain/dice";

class FixedDiceProvider {
  constructor(private readonly values: [number, number]) {}
  roll(): [number, number] {
    return this.values;
  }
}

function runningMatch(): MatchState {
  const created = createGame({ sessionId: "s1", creatorUserId: "u1" });
  const joined = joinGame(created.state, { userId: "u2", startingSeat: WHITE });
  return joined.state;
}

describe("undo", () => {
  it("allows undoing a roll before any move", () => {
    let state = runningMatch();
    const seat = state.currentTurn!;

    const rolled = rollDice(state, {
      seat,
      diceProvider: new FixedDiceProvider([3, 1]),
    });
    state = rolled.state;
    assert.equal(canUndo(state, seat), true);

    const undone = undoLast(state, { seat });
    state = undone.state;
    assert.equal(state.dice.rolled, false);
    assert.equal(canUndo(state, seat), false);
  });

  it("allows undoing a move and restores board", () => {
    let state = runningMatch();
    const seat = state.currentTurn!;
    state = rollDice(state, {
      seat,
      diceProvider: new FixedDiceProvider([3, 1]),
    }).state;

    const beforeBoard = structuredClone(state.board);
    const move = getLegalMoves(state)[0];
    state = makeMove(state, { seat, move }).state;

    assert.notDeepEqual(state.board, beforeBoard);
    assert.equal(canUndo(state, seat), true);

    state = undoLast(state, { seat }).state;
    assert.deepEqual(state.board, beforeBoard);
    assert.equal(state.dice.remaining.length, 2);
  });

  it("rejects undo when stack is empty", () => {
    const state = runningMatch();
    assert.throws(
      () => undoLast(state, { seat: state.currentTurn! }),
      (e: Error) => e.message.includes("nothing to undo")
    );
  });

  it("rejects undo on opponent turn", () => {
    let state = runningMatch();
    const seat = state.currentTurn!;
    state = rollDice(state, {
      seat,
      diceProvider: new FixedDiceProvider([3, 1]),
    }).state;

    const opponent = seat === WHITE ? 1 : 0;
    assert.throws(
      () => undoLast(state, { seat: opponent as 0 | 1 }),
      (e: Error) => e.message.includes("not your turn")
    );
  });
});
