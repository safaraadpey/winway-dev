import { NextRequest } from "next/server";
import { requireBackgammonContext } from "@/lib/backgammon/guards";
import { listBackgammonGames } from "@/lib/backgammon/repository";
import {
  backgammonOk,
  handleBackgammonRouteError,
} from "@/lib/backgammon/apiResponses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireBackgammonContext(request);
    const games = await listBackgammonGames(userId);
    return backgammonOk({ games });
  } catch (err) {
    return handleBackgammonRouteError(err);
  }
}
