import { NextRequest } from "next/server";
import { requireTicTacToeContext } from "@/lib/tic-tac-toe/guards";
import { startTicTacToeMatch } from "@/lib/tic-tac-toe/repository";
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
    const result = await startTicTacToeMatch(userId, body?.difficulty);
    return ticTacToeOk(result, 201);
  } catch (err) {
    return handleTicTacToeRouteError(err);
  }
}
