import { NextRequest } from "next/server";
import { requireBackgammonContext } from "@/lib/backgammon/guards";
import { applyBackgammonMove } from "@/lib/backgammon/repository";
import type { Move } from "@dingmoney/backgammon-engine";
import {
  backgammonFail,
  backgammonOk,
  handleBackgammonRouteError,
} from "@/lib/backgammon/apiResponses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMove(body: Record<string, unknown>): Move | null {
  const from = body.from;
  const to = body.to;
  const dieUsed = body.dieUsed;

  if (typeof dieUsed !== "number" || dieUsed < 1 || dieUsed > 6) {
    return null;
  }

  const parseEndpoint = (value: unknown): Move["from"] | Move["to"] | null => {
    if (value === "bar" || value === "off") return value;
    if (typeof value === "number" && value >= 1 && value <= 24) return value;
    return null;
  };

  const fromEp = parseEndpoint(from);
  const toEp = parseEndpoint(to);
  if (fromEp === null || toEp === null) return null;

  return { from: fromEp, to: toEp, dieUsed };
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireBackgammonContext(request);
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const expectedVersion =
      typeof body.expectedVersion === "number" ? body.expectedVersion : NaN;
    const move = parseMove(body as Record<string, unknown>);

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
    if (!move) {
      return backgammonFail("missing_parameters", "Valid move is required.", 400);
    }

    const result = await applyBackgammonMove(
      sessionId,
      userId,
      expectedVersion,
      move
    );
    return backgammonOk(result);
  } catch (err) {
    return handleBackgammonRouteError(err);
  }
}
