import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGame, playFullTurn } from "./game";
import { replayPlayerMoves } from "./replay";

describe("replay", () => {
  it("replays a deterministic win for player", () => {
    const seed = "test-seed-win";
    let { state } = createGame({ seed, difficulty: "easy" });
    const playerMoves: number[] = [];

    while (state.status === "playing") {
      const legal = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => state.board[i] === null);
      const cell = legal[0]!;
      playerMoves.push(cell);
      ({ state } = playFullTurn(state, cell));
      if (playerMoves.length > 20) break;
    }

    const replay = replayPlayerMoves({ seed, difficulty: "easy", playerMoves });
    assert.equal(replay.valid, true);
    if (replay.valid) {
      assert.equal(replay.outcome, state.outcome);
    }
  });

  it("rejects illegal move", () => {
    const replay = replayPlayerMoves({
      seed: "bad-seed",
      difficulty: "hard",
      playerMoves: [0, 0],
    });
    assert.equal(replay.valid, false);
    if (!replay.valid) {
      assert.equal(replay.code, "cell_occupied");
    }
  });

  it("hard AI blocks immediate win", () => {
    let { state } = createGame({ seed: "block-test", difficulty: "hard" });
    ({ state } = playFullTurn(state, 0));
    ({ state } = playFullTurn(state, 1));
    assert.equal(state.board[2], "O");
  });
});
