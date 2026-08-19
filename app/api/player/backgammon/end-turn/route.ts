import { NextRequest } from "next/server";
import { requireBackgammonContext } from "@/lib/backgammon/guards";
import { endBackgammonTurn } from "@/lib/backgammon/repository";
import { getPublicSnapshot } from "@/lib/backgammon/snapshot";
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
    const expectedVersion =
      typeof body.expectedVersion === "number" ? body.expectedVersion : NaN;

    if (!sessionId) {
      return backgammonFail("missing_parameters", "sessionId is required.", 400);
    }
    if (!Number.isInteger(expectedVersion)) {
      return backgammonFail(
        "missing_parameters",
        "expectedVersion is required.",
        400
      );
    }

    const result = await endBackgammonTurn(sessionId, userId, expectedVersion);
    const snapshot = await getPublicSnapshot(sessionId, userId);
    return backgammonOk({ stateVersion: result.stateVersion, snapshot });
  } catch (err) {
    return handleBackgammonRouteError(err);
  }
}
