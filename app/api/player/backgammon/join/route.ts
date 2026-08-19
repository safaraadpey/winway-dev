import { NextRequest } from "next/server";
import { requireBackgammonContext } from "@/lib/backgammon/guards";
import { joinBackgammonGame } from "@/lib/backgammon/repository";
import {
  backgammonFail,
  backgammonOk,
  handleBackgammonRouteError,
} from "@/lib/backgammon/apiResponses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireBackgammonContext(request);
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) {
      return backgammonFail("missing_parameters", "sessionId is required.", 400);
    }

    const result = await joinBackgammonGame(sessionId, userId);
    return backgammonOk(result);
  } catch (err) {
    return handleBackgammonRouteError(err);
  }
}
