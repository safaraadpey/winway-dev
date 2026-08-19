import {
  allInHome,
  barCount,
  barEntryPoint,
  cloneBoard,
  countAt,
  highestOccupiedHomePoint,
  isBlocked,
  isBlot,
  isHomePoint,
  moveDestination,
  opponent,
  opponentCountAt,
} from "./board";
import {
  consumeDie,
  diceFullyConsumed,
  expandDice,
  hasRemainingDice,
} from "./dice";
import type {
  Board,
  DiceState,
  MatchState,
  Move,
  MoveEndpoint,
  Seat,
  WinKind,
} from "./types";
import { DomainError, BLACK, WHITE } from "./types";

function cloneMatchState(state: MatchState): MatchState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    board: cloneBoard(state.board),
    dice: { ...state.dice, remaining: [...state.dice.remaining] },
  };
}

function removeChecker(board: Board, point: number, seat: Seat): void {
  const stack = board.points[point];
  if (seat === WHITE) {
    if (stack.white <= 0) throw new DomainError("no checker", "no_checker");
    stack.white -= 1;
  } else {
    if (stack.black <= 0) throw new DomainError("no checker", "no_checker");
    stack.black -= 1;
  }
}

function addChecker(board: Board, point: number, seat: Seat): void {
  const stack = board.points[point];
  if (seat === WHITE) stack.white += 1;
  else stack.black += 1;
}

function canBearOffFrom(board: Board, from: number, die: number, seat: Seat): boolean {
  if (!allInHome(board, seat)) return false;
  if (seat === WHITE) {
    const dest = from - die;
    if (dest === 0) return true;
    if (dest < 0) {
      const highest = highestOccupiedHomePoint(board, seat);
      return highest !== null && from === highest;
    }
    return false;
  }
  const dest = from + die;
  if (dest === 25) return true;
  if (dest > 24) {
    const highest = highestOccupiedHomePoint(board, seat);
    return highest !== null && from === highest;
  }
  return false;
}

function legalBarEntries(state: MatchState, seat: Seat, remaining: number[]): Move[] {
  const moves: Move[] = [];
  const seen = new Set<string>();
  for (const die of remaining) {
    const point = barEntryPoint(seat, die);
    if (isBlocked(state.board, point, seat)) continue;
    const key = `bar:${point}:${die}`;
    if (seen.has(key)) continue;
    seen.add(key);
    moves.push({ from: "bar", to: point, dieUsed: die });
  }
  return moves;
}

function legalBoardMoves(
  state: MatchState,
  seat: Seat,
  remaining: number[]
): Move[] {
  const moves: Move[] = [];
  const seen = new Set<string>();

  for (let from = 1; from <= 24; from++) {
    if (countAt(state.board, from, seat) === 0) continue;

    for (const die of remaining) {
      const dest = moveDestination(from, die, seat);

      if (seat === WHITE) {
        if (dest < 1) {
          if (canBearOffFrom(state.board, from, die, seat)) {
            const key = `${from}:off:${die}`;
            if (!seen.has(key)) {
              seen.add(key);
              moves.push({ from, to: "off", dieUsed: die });
            }
          }
          continue;
        }
        if (dest > 24) continue;
      } else {
        if (dest > 24) {
          if (canBearOffFrom(state.board, from, die, seat)) {
            const key = `${from}:off:${die}`;
            if (!seen.has(key)) {
              seen.add(key);
              moves.push({ from, to: "off", dieUsed: die });
            }
          }
          continue;
        }
        if (dest < 1) continue;
      }

      if (isBlocked(state.board, dest, seat)) continue;
      const key = `${from}:${dest}:${die}`;
      if (seen.has(key)) continue;
      seen.add(key);
      moves.push({ from, to: dest, dieUsed: die });
    }
  }

  return moves;
}

/** Must use higher die when only one die fits (bearing off rule) */
function filterBearOffHigherDieRule(state: MatchState, seat: Seat, moves: Move[]): Move[] {
  if (!allInHome(state.board, seat)) return moves;

  const remaining = state.dice.remaining;
  if (remaining.length <= 1) return moves;

  const unique = [...new Set(remaining)];
  if (unique.length <= 1) return moves;

  const bearOffMoves = moves.filter((m) => m.to === "off");
  if (bearOffMoves.length === 0) return moves;

  const nonBearOff = moves.filter((m) => m.to !== "off");
  if (nonBearOff.length > 0) return moves;

  const maxDie = Math.max(...unique);
  const minDie = Math.min(...unique);

  const canUseMax = bearOffMoves.some((m) => m.dieUsed === maxDie);
  const canUseMin = bearOffMoves.some((m) => m.dieUsed === minDie);

  if (canUseMax && !canUseMin) {
    return bearOffMoves.filter((m) => m.dieUsed === maxDie);
  }
  if (canUseMin && !canUseMax) {
    return bearOffMoves.filter((m) => m.dieUsed === minDie);
  }

  return moves;
}

export function getLegalMoves(state: MatchState, forSeat?: Seat): Move[] {
  if (state.status !== "running") return [];
  const seat = forSeat ?? state.currentTurn;
  if (seat === null) return [];
  if (!state.dice.rolled || state.dice.remaining.length === 0) return [];

  const remaining = state.dice.remaining;

  if (barCount(state.board, seat) > 0) {
    return legalBarEntries(state, seat, remaining);
  }

  let moves = legalBoardMoves(state, seat, remaining);
  moves = filterBearOffHigherDieRule(state, seat, moves);

  if (moves.length === 0) return [];

  if (remaining.length === 2 && remaining[0] !== remaining[1]) {
    const [a, b] = remaining;
    const movesA = getLegalMovesForRemaining(
      { ...state, dice: { ...state.dice, remaining: [a] } },
      seat
    );
    const movesB = getLegalMovesForRemaining(
      { ...state, dice: { ...state.dice, remaining: [b] } },
      seat
    );
    if (movesA.length > 0 && movesB.length === 0) {
      return moves.filter((m) => m.dieUsed === a);
    }
    if (movesB.length > 0 && movesA.length === 0) {
      return moves.filter((m) => m.dieUsed === b);
    }
  }

  return moves;
}

function getLegalMovesForRemaining(state: MatchState, seat: Seat): Move[] {
  if (barCount(state.board, seat) > 0) {
    return legalBarEntries(state, seat, state.dice.remaining);
  }
  return legalBoardMoves(state, seat, state.dice.remaining);
}

export function mustPass(state: MatchState): boolean {
  if (state.status !== "running" || !state.dice.rolled) return false;
  return getLegalMoves(state).length === 0;
}

export function applyMove(state: MatchState, move: Move): MatchState {
  if (state.status !== "running") {
    throw new DomainError("game not running", "game_not_running");
  }
  const seat = state.currentTurn;
  if (seat === null) {
    throw new DomainError("no current turn", "no_turn");
  }

  const legal = getLegalMoves(state, seat);
  const isLegal = legal.some(
    (m) =>
      m.from === move.from &&
      m.to === move.to &&
      m.dieUsed === move.dieUsed
  );
  if (!isLegal) {
    throw new DomainError("illegal move", "illegal_move");
  }

  const next = cloneMatchState(state);
  let hit = false;

  if (move.from === "bar") {
    if (seat === WHITE) next.board.bar.white -= 1;
    else next.board.bar.black -= 1;
  } else {
    removeChecker(next.board, move.from as number, seat);
  }

  if (move.to === "off") {
    if (seat === WHITE) next.board.borneOff.white += 1;
    else next.board.borneOff.black += 1;
  } else {
    const dest = move.to as number;
    if (isBlot(next.board, dest, seat)) {
      hit = true;
      if (opponent(seat) === WHITE) {
        next.board.points[dest].white = 0;
        next.board.bar.white += 1;
      } else {
        next.board.points[dest].black = 0;
        next.board.bar.black += 1;
      }
    }
    addChecker(next.board, dest, seat);
  }

  next.dice = consumeDie(next.dice, move.dieUsed);

  const winner = detectWinner(next);
  if (winner !== null) {
    next.winner = winner.seat;
    next.winKind = winner.winKind;
    next.status = "finished";
    next.currentTurn = null;
    next.dice = { values: null, remaining: [], rolled: false };
  }

  return next;
}

export function detectWinner(state: MatchState): { seat: Seat; winKind: WinKind } | null {
  if (state.board.borneOff.white === 15) {
    return { seat: WHITE, winKind: classifyWin(state, WHITE) };
  }
  if (state.board.borneOff.black === 15) {
    return { seat: BLACK, winKind: classifyWin(state, BLACK) };
  }
  return null;
}

export function classifyWin(state: MatchState, winner: Seat): WinKind {
  const loser = opponent(winner);
  const loserBorne = winner === WHITE ? state.board.borneOff.black : state.board.borneOff.white;
  if (loserBorne > 0) return "single";

  const loserOnBar = barCount(state.board, loser);
  if (loserOnBar > 0) return "backgammon";

  for (let p = 1; p <= 24; p++) {
    if (countAt(state.board, p, loser) > 0 && !isHomePoint(p, loser)) {
      return "gammon";
    }
  }

  return "single";
}

export function endTurn(state: MatchState): MatchState {
  if (state.status !== "running") {
    throw new DomainError("game not running", "game_not_running");
  }
  if (!state.dice.rolled) {
    throw new DomainError("dice not rolled", "dice_not_rolled");
  }
  if (hasRemainingDice(state.dice) && getLegalMoves(state).length > 0) {
    throw new DomainError("moves remain", "moves_remain");
  }

  const next = cloneMatchState(state);
  next.currentTurn = opponent(state.currentTurn!);
  next.dice = { values: null, remaining: [], rolled: false };
  next.undoStack = [];
  return next;
}

export function canRoll(state: MatchState, seat: Seat): boolean {
  return (
    state.status === "running" &&
    state.currentTurn === seat &&
    !state.dice.rolled
  );
}

export function assertTurn(state: MatchState, seat: Seat): void {
  if (state.currentTurn !== seat) {
    throw new DomainError("not your turn", "not_your_turn");
  }
}

export function moveKey(move: Move): string {
  return `${move.from}->${move.to}@${move.dieUsed}`;
}

export { expandDice, diceFullyConsumed, hasRemainingDice };
