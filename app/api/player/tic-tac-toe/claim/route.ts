import { NextRequest } from "next/server";
import { requireTicTacToeContext } from "@/lib/tic-tac-toe/guards";
import {
  TicTacToeRepositoryError,
  claimTicTacToeMatch,
} from "@/lib/tic-tac-toe/repository";
import {
  handleTicTacToeRouteError,
  ticTacToeOk,
} from "@/lib/tic-tac-toe/apiResponses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireTicTacToeContext(request);
    const body = await request.json();
    const matchId = typeof body?.matchId === "string" ? body.matchId : "";
    if (!matchId) {
      throw new TicTacToeRepositoryError(
        "matchId is required.",
        "invalid_match_id",
        400
      );
    }
    const result = await claimTicTacToeMatch(
      userId,
      matchId,
      body?.playerMoves
    );
    return ticTacToeOk(result);
  } catch (err) {
    return handleTicTacToeRouteError(err);
  }
}
