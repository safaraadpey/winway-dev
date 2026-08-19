import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialBoard, countAt, barCount } from "./board";
import {
  createGame,
  joinGame,
  rollDice,
} from "../application/game";
import { getLegalMoves, applyMove, detectWinner, mustPass } from "./rules";
import type { MatchState, Seat } from "./types";
import { BLACK, WHITE } from "./types";
import { setRolledDice } from "./dice";

function runningMatch(): MatchState {
  const created = createGame({ sessionId: "s1", creatorUserId: "u1" });
  const joined = joinGame(created.state, { userId: "u2" });
  return joined.state;
}

function withDice(state: MatchState, a: number, b: number, seat: Seat = state.currentTurn!): MatchState {
  return {
    ...state,
    currentTurn: seat,
    dice: setRolledDice(state.dice, [a, b]),
  };
}

function boardWith(state: MatchState, setup: (s: MatchState) => void): MatchState {
  const next = structuredClone(state);
  setup(next);
  return next;
}

describe("initial board", () => {
  it("has standard 15 checkers per player", () => {
    const board = createInitialBoard();
    let white = board.borneOff.white;
    let black = board.borneOff.black;
    for (let p = 1; p <= 24; p++) {
      white += board.points[p].white;
      black += board.points[p].black;
    }
    white += board.bar.white;
    black += board.bar.black;
    assert.equal(white, 15);
    assert.equal(black, 15);
    assert.equal(countAt(board, 24, WHITE), 2);
    assert.equal(countAt(board, 1, BLACK), 2);
  });
});

describe("normal move", () => {
  it("allows white to move with rolled dice", () => {
    let state = runningMatch();
    state = withDice(state, 3, 1);
    const moves = getLegalMoves(state);
    assert.ok(moves.length > 0);
    const move = moves[0];
    const next = applyMove(state, move);
    assert.ok(next.dice.remaining.length <= 1);
  });
});

describe("illegal move", () => {
  it("rejects move to blocked point", () => {
    let state = runningMatch();
    state = boardWith(state, (s) => {
      s.board = createInitialBoard();
      s.board.points[10] = { white: 0, black: 0 };
      s.board.points[11] = { white: 1, black: 0 };
      s.board.points[12] = { white: 0, black: 2 };
      s.currentTurn = WHITE;
      s.dice = setRolledDice(s.dice, [1, 2]);
    });
    assert.throws(
      () => applyMove(state, { from: 11, to: 12, dieUsed: 1 }),
      (e: Error) => e.message.includes("illegal")
    );
  });
});

describe("blocked point", () => {
  it("does not list moves onto 2+ opponent checkers", () => {
    let state = runningMatch();
    state = boardWith(state, (s) => {
      for (let p = 1; p <= 24; p++) {
        s.board.points[p] = { white: 0, black: 0 };
      }
      s.board.points[8] = { white: 1, black: 0 };
      s.board.points[5] = { white: 0, black: 3 };
      s.currentTurn = WHITE;
      s.dice = setRolledDice(s.dice, [3, 4]);
    });
    const moves = getLegalMoves(state);
    assert.ok(!moves.some((m) => m.to === 5));
  });
});

describe("blot hit", () => {
  it("sends opponent checker to bar", () => {
    let state = runningMatch();
    state = boardWith(state, (s) => {
      for (let p = 1; p <= 24; p++) s.board.points[p] = { white: 0, black: 0 };
      s.board.points[10] = { white: 1, black: 0 };
      s.board.points[7] = { white: 0, black: 1 };
      s.currentTurn = WHITE;
      s.dice = setRolledDice(s.dice, [3, 5]);
    });
    const next = applyMove(state, { from: 10, to: 7, dieUsed: 3 });
    assert.equal(countAt(next.board, 7, WHITE), 1);
    assert.equal(barCount(next.board, BLACK), 1);
  });
});

describe("bar entry", () => {
  it("requires entering from bar before other moves", () => {
    let state = runningMatch();
    state = boardWith(state, (s) => {
      for (let p = 1; p <= 24; p++) s.board.points[p] = { white: 0, black: 0 };
      s.board.bar.white = 1;
      s.board.points[20] = { white: 0, black: 1 };
      s.currentTurn = WHITE;
      s.dice = setRolledDice(s.dice, [5, 3]);
    });
    const moves = getLegalMoves(state);
    assert.ok(moves.every((m) => m.from === "bar"));
    assert.ok(moves.some((m) => m.to === 20 && m.dieUsed === 5));
  });
});

describe("forced bar entry", () => {
  it("only bar moves when checker on bar", () => {
    let state = runningMatch();
    state = boardWith(state, (s) => {
      for (let p = 1; p <= 24; p++) s.board.points[p] = { white: 0, black: 0 };
      s.board.bar.black = 2;
      s.board.points[5] = { white: 3, black: 0 };
      s.currentTurn = BLACK;
      s.dice = setRolledDice(s.dice, [2, 4]);
    });
    const moves = getLegalMoves(state);
    assert.ok(moves.length > 0);
    assert.ok(moves.every((m) => m.from === "bar"));
  });
});

describe("double dice", () => {
  it("grants four moves on doubles", () => {
    let state = runningMatch();
    state = withDice(state, 4, 4);
    assert.equal(state.dice.remaining.length, 4);
  });
});

describe("dice consumption", () => {
  it("removes used die from remaining", () => {
    let state = runningMatch();
    state = boardWith(state, (s) => {
      for (let p = 1; p <= 24; p++) s.board.points[p] = { white: 0, black: 0 };
      s.board.points[13] = { white: 2, black: 0 };
      s.currentTurn = WHITE;
      s.dice = setRolledDice(s.dice, [2, 3]);
    });
    const next = applyMove(state, { from: 13, to: 11, dieUsed: 2 });
    assert.deepEqual(next.dice.remaining, [3]);
  });
});

describe("bearing off", () => {
  it("allows bearing off when all checkers home", () => {
    let state = runningMatch();
    state = boardWith(state, (s) => {
      for (let p = 1; p <= 24; p++) s.board.points[p] = { white: 0, black: 0 };
      s.board.points[3] = { white: 1, black: 0 };
      s.board.borneOff.white = 14;
      s.currentTurn = WHITE;
      s.dice = setRolledDice(s.dice, [3, 5]);
    });
    const moves = getLegalMoves(state);
    assert.ok(moves.some((m) => m.to === "off" && m.dieUsed === 3));
    const next = applyMove(state, { from: 3, to: "off", dieUsed: 3 });
    assert.equal(next.board.borneOff.white, 15);
    assert.equal(next.status, "finished");
  });
});

describe("winner detection", () => {
  it("detects winner when all checkers borne off", () => {
    let state = runningMatch();
    state = boardWith(state, (s) => {
      for (let p = 1; p <= 24; p++) s.board.points[p] = { white: 0, black: 0 };
      s.board.borneOff.white = 15;
      s.status = "running";
    });
    const winner = detectWinner(state);
    assert.ok(winner);
    assert.equal(winner.seat, WHITE);
  });
});

describe("must pass", () => {
  it("detects no legal moves after roll", () => {
    let state = runningMatch();
    state = boardWith(state, (s) => {
      for (let p = 1; p <= 24; p++) s.board.points[p] = { white: 0, black: 0 };
      s.board.points[20] = { white: 1, black: 0 };
      s.board.points[19] = { white: 0, black: 2 };
      s.board.points[18] = { white: 0, black: 2 };
      s.currentTurn = WHITE;
      s.dice = setRolledDice(s.dice, [1, 2]);
    });
    assert.ok(mustPass(state));
  });
});

describe("rollDice application", () => {
  it("auto-passes when no legal moves", () => {
    let state = runningMatch();
    state = boardWith(state, (s) => {
      for (let p = 1; p <= 24; p++) s.board.points[p] = { white: 0, black: 0 };
      s.board.points[20] = { white: 1, black: 0 };
      s.board.points[19] = { white: 0, black: 2 };
      s.board.points[18] = { white: 0, black: 2 };
      s.currentTurn = WHITE;
    });
    const provider = { roll: () => [1, 2] as [number, number] };
    const result = rollDice(state, { seat: WHITE, diceProvider: provider });
    assert.equal(result.state.currentTurn, BLACK);
    assert.equal(result.state.dice.rolled, false);
  });
});
