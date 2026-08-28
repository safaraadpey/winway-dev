import { createEmptyBoard, setCell } from "../domain/board";
import {
  assertLegalMove,
  getLegalMoves,
  nextTurnAfterMove,
  resolveOutcome,
} from "../domain/rules";
import {
  DomainError,
  MACHINE_MARK,
  PLAYER_MARK,
  type ApplicationResult,
  type Difficulty,
  type MatchState,
  type MoveRecord,
} from "../domain/types";
import { pickMachineMove } from "./ai";

export function createGame(input: {
  seed: string;
  difficulty: Difficulty;
}): ApplicationResult {
  const state: MatchState = {
    board: createEmptyBoard(),
    status: "playing",
    currentTurn: "player",
    outcome: null,
    moveCount: 0,
    seed: input.seed,
    difficulty: input.difficulty,
  };

  return {
    state,
    events: [
      {
        type: "game_created",
        seed: input.seed,
        difficulty: input.difficulty,
      },
    ],
  };
}

export function applyPlayerMove(state: MatchState, cell: number): ApplicationResult {
  if (state.status === "finished") {
    throw new DomainError("game finished", "game_finished");
  }
  assertLegalMove(state.board, cell, state.currentTurn);

  const board = setCell(state.board, cell, PLAYER_MARK);
  const outcome = resolveOutcome(board);
  const events: ApplicationResult["events"] = [
    { type: "move_played", cell, by: PLAYER_MARK },
  ];

  if (outcome !== null) {
    const finished: MatchState = {
      ...state,
      board,
      status: "finished",
      currentTurn: "player",
      outcome,
      moveCount: state.moveCount + 1,
    };
    events.push({ type: "game_finished", outcome });
    return { state: finished, events };
  }

  return {
    state: {
      ...state,
      board,
      currentTurn: "machine",
      moveCount: state.moveCount + 1,
    },
    events,
  };
}

export function applyMachineMove(state: MatchState): ApplicationResult {
  if (state.status === "finished") {
    throw new DomainError("game finished", "game_finished");
  }
  if (state.currentTurn !== "machine") {
    throw new DomainError("not machine turn", "wrong_turn");
  }

  const machineMoveIndex = Math.floor(state.moveCount / 2);
  const cell = pickMachineMove(
    state.board,
    state.difficulty,
    state.seed,
    machineMoveIndex
  );

  if (cell < 0 || !getLegalMoves(state.board).includes(cell)) {
    throw new DomainError("no legal machine move", "no_legal_move");
  }

  const board = setCell(state.board, cell, MACHINE_MARK);
  const outcome = resolveOutcome(board);
  const events: ApplicationResult["events"] = [
    { type: "move_played", cell, by: MACHINE_MARK },
  ];

  if (outcome !== null) {
    const finished: MatchState = {
      ...state,
      board,
      status: "finished",
      currentTurn: "machine",
      outcome,
      moveCount: state.moveCount + 1,
    };
    events.push({ type: "game_finished", outcome });
    return { state: finished, events };
  }

  return {
    state: {
      ...state,
      board,
      currentTurn: "player",
      moveCount: state.moveCount + 1,
    },
    events,
  };
}

export function playFullTurn(state: MatchState, playerCell: number): ApplicationResult {
  let current = applyPlayerMove(state, playerCell);
  if (current.state.status === "finished") {
    return current;
  }
  return applyMachineMove(current.state);
}

export function buildMoveHistory(playerMoves: number[]): MoveRecord[] {
  return playerMoves.map((cell) => ({ cell, by: "player" as const }));
}
