import { createInitialBoard } from "../domain/board";
import { createDiceState, setRolledDice } from "../domain/dice";
import {
  applyMove,
  assertTurn,
  canRoll,
  endTurn,
  getLegalMoves,
  mustPass,
} from "../domain/rules";
import type {
  ApplicationResult,
  DicePair,
  MatchState,
  Move,
  Seat,
} from "../domain/types";
import { DomainError, BLACK, WHITE } from "../domain/types";
import type { DiceProvider } from "../ports/DiceProvider";

export function createGame(input: {
  sessionId: string;
  creatorUserId: string;
}): ApplicationResult {
  const state: MatchState = {
    sessionId: input.sessionId,
    status: "waiting",
    players: [{ userId: input.creatorUserId, seat: WHITE }],
    currentTurn: null,
    board: createInitialBoard(),
    dice: createDiceState(),
    winner: null,
    winKind: null,
  };

  return {
    state,
    events: [{ type: "game_created", sessionId: input.sessionId, creatorSeat: WHITE }],
  };
}

export function joinGame(
  state: MatchState,
  input: { userId: string; startingSeat?: Seat }
): ApplicationResult {
  if (state.status !== "waiting") {
    throw new DomainError("game not waiting", "game_not_waiting");
  }
  if (state.players.some((p) => p.userId === input.userId)) {
    throw new DomainError("already joined", "already_joined");
  }
  if (state.players.length >= 2) {
    throw new DomainError("game full", "game_full");
  }

  const seat: Seat = BLACK;
  const next: MatchState = {
    ...state,
    status: "running",
    players: [...state.players, { userId: input.userId, seat }],
    currentTurn: input.startingSeat ?? WHITE,
    board: createInitialBoard(),
    dice: createDiceState(),
  };

  return {
    state: next,
    events: [
      { type: "player_joined", userId: input.userId, seat },
      { type: "game_started", startingSeat: next.currentTurn! },
    ],
  };
}

export function getGameState(state: MatchState): MatchState {
  return state;
}

export function rollDice(
  state: MatchState,
  input: { seat: Seat; diceProvider: DiceProvider }
): ApplicationResult {
  if (state.status !== "running") {
    throw new DomainError("game not running", "game_not_running");
  }
  assertTurn(state, input.seat);
  if (!canRoll(state, input.seat)) {
    throw new DomainError("cannot roll dice", "cannot_roll");
  }

  const values = input.diceProvider.roll();
  let next: MatchState = {
    ...state,
    dice: setRolledDice(state.dice, values),
  };

  const events: ApplicationResult["events"] = [
    { type: "dice_rolled", values, seat: input.seat },
  ];

  if (mustPass(next)) {
    const ended = endTurn(next);
    events.push({
      type: "turn_ended",
      previousSeat: input.seat,
      nextSeat: ended.currentTurn!,
    });
    next = ended;
  }

  return { state: next, events };
}

export function makeMove(
  state: MatchState,
  input: { seat: Seat; move: Move }
): ApplicationResult {
  assertTurn(state, input.seat);
  if (!state.dice.rolled) {
    throw new DomainError("dice not rolled", "dice_not_rolled");
  }

  const before = state.board;
  const next = applyMove(state, input.move);
  const hit =
    input.move.to !== "off" &&
    typeof input.move.to === "number" &&
    before.points[input.move.to] &&
    next.board.bar.white + next.board.bar.black >
      before.bar.white + before.bar.black;

  const events: ApplicationResult["events"] = [
    {
      type: "move_made",
      move: input.move,
      seat: input.seat,
      hit: Boolean(hit),
    },
  ];

  if (next.status === "finished") {
    events.push({
      type: "game_finished",
      winner: next.winner!,
      winKind: next.winKind!,
    });
    return { state: next, events };
  }

  if (next.dice.remaining.length === 0 || getLegalMoves(next).length === 0) {
    const ended = endTurn(next);
    events.push({
      type: "turn_ended",
      previousSeat: input.seat,
      nextSeat: ended.currentTurn!,
    });
    return { state: ended, events };
  }

  return { state: next, events };
}

export function finishTurn(
  state: MatchState,
  input: { seat: Seat }
): ApplicationResult {
  assertTurn(state, input.seat);
  const previous = input.seat;
  const next = endTurn(state);
  return {
    state: next,
    events: [
      {
        type: "turn_ended",
        previousSeat: previous,
        nextSeat: next.currentTurn!,
      },
    ],
  };
}

export function finishGame(state: MatchState): ApplicationResult {
  if (state.status !== "finished" || state.winner === null) {
    throw new DomainError("game not finished", "game_not_finished");
  }
  return {
    state,
    events: [
      {
        type: "game_finished",
        winner: state.winner,
        winKind: state.winKind ?? "single",
      },
    ],
  };
}

export { getLegalMoves, mustPass };

export type SerializedMatchState = MatchState;

export function deserializeMatchState(raw: SerializedMatchState): MatchState {
  return {
    ...raw,
    players: raw.players.map((p) => ({ ...p })),
    board: {
      points: raw.board.points.map((s) => ({ ...s })),
      bar: { ...raw.board.bar },
      borneOff: { ...raw.board.borneOff },
    },
    dice: {
      ...raw.dice,
      remaining: [...raw.dice.remaining],
      values: raw.dice.values ? [...raw.dice.values] as DicePair : null,
    },
  };
}
