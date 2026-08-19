import { NextRequest } from "next/server";
import { requireBackgammonContext } from "@/lib/backgammon/guards";
import { createBackgammonGame } from "@/lib/backgammon/repository";
import {
  backgammonOk,
  handleBackgammonRouteError,
} from "@/lib/backgammon/apiResponses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireBackgammonContext(request);
    const result = await createBackgammonGame(userId);
    return backgammonOk(result, 201);
  } catch (err) {
    return handleBackgammonRouteError(err);
  }
}
