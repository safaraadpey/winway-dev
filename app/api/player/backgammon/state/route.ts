import { NextRequest } from "next/server";
import {
  backgammonFail,
  backgammonOk,
  handleBackgammonRouteError,
} from "@/lib/backgammon/apiResponses";
import {
  buildPublicSnapshot,
  loadAuthorizedSnapshot,
} from "@/lib/backgammon/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return backgammonFail("missing_parameters", "sessionId is required.", 400);
    }

    const { userId, snapshot } = await loadAuthorizedSnapshot(request, sessionId);
    return backgammonOk(buildPublicSnapshot(snapshot, userId));
  } catch (err) {
    return handleBackgammonRouteError(err);
  }
}
