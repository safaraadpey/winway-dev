import { NextRequest } from "next/server";
import {
  requireBackgammonContext,
  assertMembership,
  seatForUser,
} from "@/lib/backgammon/guards";
import {
  getBackgammonSnapshot,
  type BackgammonSnapshot,
} from "@/lib/backgammon/repository";
import { WHITE, BLACK } from "@dingmoney/backgammon-engine";

export function buildPublicSnapshot(
  snapshot: BackgammonSnapshot,
  userId: string
) {
  const myParticipant = snapshot.participants.find((p) => p.user_id === userId);
  const opponent = snapshot.participants.find((p) => p.user_id !== userId);

  return {
    sessionId: snapshot.sessionId,
    status: snapshot.status,
    stateVersion: snapshot.stateVersion,
    matchStatus: snapshot.matchState.status,
    currentTurn: snapshot.matchState.currentTurn,
    currentTurnSeat:
      snapshot.matchState.currentTurn === WHITE
        ? "white"
        : snapshot.matchState.currentTurn === BLACK
          ? "black"
          : null,
    board: snapshot.matchState.board,
    dice: snapshot.matchState.dice,
    winner: snapshot.matchState.winner,
    winKind: snapshot.matchState.winKind,
    mySeat: snapshot.mySeat,
    myUserId: userId,
    players: snapshot.participants.map((p) => ({
      userId: p.user_id,
      seat: p.seat_no,
      seatLabel: p.seat_no === 0 ? "white" : "black",
    })),
    opponentUserId: opponent?.user_id ?? null,
    legalMoves: snapshot.legalMoves,
    isMyTurn:
      snapshot.mySeat !== null &&
      snapshot.matchState.currentTurn === snapshot.mySeat &&
      snapshot.matchState.status === "running",
    canRoll:
      snapshot.mySeat !== null &&
      snapshot.matchState.currentTurn === snapshot.mySeat &&
      snapshot.matchState.status === "running" &&
      !snapshot.matchState.dice.rolled,
  };
}

export async function loadAuthorizedSnapshot(
  request: NextRequest,
  sessionId: string
) {
  const { userId } = await requireBackgammonContext(request);
  const snapshot = await getBackgammonSnapshot(sessionId, userId);
  assertMembership(snapshot.participants, userId);
  return { userId, snapshot, seat: seatForUser(snapshot.participants, userId) };
}
