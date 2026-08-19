import type { Move, MatchState, Seat, WinKind } from "@dingmoney/backgammon-engine";
import {
  makeMove,
  getLegalMoves,
  canUndo,
  WHITE,
  BLACK,
} from "@dingmoney/backgammon-engine";
import type { BackgammonPublicSnapshot } from "./publicSnapshot";

export function snapshotToMatchState(snapshot: BackgammonPublicSnapshot): MatchState {
  return {
    sessionId: snapshot.sessionId,
    status: snapshot.matchStatus as MatchState["status"],
    players: snapshot.players.map((p) => ({
      userId: p.userId,
      seat: p.seat as Seat,
    })),
    currentTurn: snapshot.currentTurn,
    board: {
      points: snapshot.board.points.map((p) => ({ ...p })),
      bar: { ...snapshot.board.bar },
      borneOff: { ...snapshot.board.borneOff },
    },
    dice: {
      values: snapshot.dice.values
        ? ([...snapshot.dice.values] as [number, number])
        : null,
      remaining: [...snapshot.dice.remaining],
      rolled: snapshot.dice.rolled,
    },
    winner: snapshot.winner,
    winKind: snapshot.winKind as WinKind | null,
  };
}

export function matchStateToPublicSnapshot(
  base: BackgammonPublicSnapshot,
  state: MatchState
): BackgammonPublicSnapshot {
  const mySeat = base.mySeat;
  const legalMoves =
    mySeat !== null && state.status === "running"
      ? getLegalMoves(state, mySeat)
      : [];

  return {
    ...base,
    matchStatus: state.status,
    currentTurn: state.currentTurn,
    currentTurnSeat:
      state.currentTurn === WHITE
        ? "white"
        : state.currentTurn === BLACK
          ? "black"
          : null,
    board: state.board,
    dice: state.dice,
    winner: state.winner,
    winKind: state.winKind,
    legalMoves,
    isMyTurn:
      mySeat !== null &&
      state.currentTurn === mySeat &&
      state.status === "running",
    canRoll:
      mySeat !== null &&
      state.currentTurn === mySeat &&
      state.status === "running" &&
      !state.dice.rolled,
    canUndo:
      mySeat !== null && canUndo(state, mySeat),
  };
}

export function applyOptimisticMove(
  snapshot: BackgammonPublicSnapshot,
  move: Move
): BackgammonPublicSnapshot | null {
  if (!snapshot.mySeat || !snapshot.isMyTurn) return null;

  try {
    const result = makeMove(snapshotToMatchState(snapshot), {
      seat: snapshot.mySeat,
      move,
    });
    return matchStateToPublicSnapshot(snapshot, result.state);
  } catch {
    return null;
  }
}
