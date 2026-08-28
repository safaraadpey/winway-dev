import { DomainError } from "../domain/types";
import type { Difficulty, Outcome } from "../domain/types";
import { applyMachineMove, applyPlayerMove, createGame } from "./game";

export type ReplayResult =
  | { valid: true; outcome: Exclude<Outcome, null> }
  | { valid: false; error: string; code: string };

export function replayPlayerMoves(input: {
  seed: string;
  difficulty: Difficulty;
  playerMoves: number[];
}): ReplayResult {
  try {
    let { state } = createGame({
      seed: input.seed,
      difficulty: input.difficulty,
    });

    for (const cell of input.playerMoves) {
      if (state.status === "finished") {
        return {
          valid: false,
          error: "extra moves after game finished",
          code: "extra_moves",
        };
      }

      const playerResult = applyPlayerMove(state, cell);
      state = playerResult.state;

      if (state.status === "finished") {
        if (state.outcome === null) {
          return { valid: false, error: "missing outcome", code: "missing_outcome" };
        }
        return { valid: true, outcome: state.outcome };
      }

      const machineResult = applyMachineMove(state);
      state = machineResult.state;

      if (state.status === "finished") {
        if (state.outcome === null) {
          return { valid: false, error: "missing outcome", code: "missing_outcome" };
        }
        return { valid: true, outcome: state.outcome };
      }
    }

    if (state.status === "playing") {
      return {
        valid: false,
        error: "game still in progress",
        code: "game_in_progress",
      };
    }

    if (state.outcome === null) {
      return { valid: false, error: "missing outcome", code: "missing_outcome" };
    }

    return { valid: true, outcome: state.outcome };
  } catch (err) {
    if (err instanceof DomainError) {
      return { valid: false, error: err.message, code: err.code };
    }
    throw err;
  }
}
