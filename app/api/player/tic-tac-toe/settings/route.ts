import { NextRequest } from "next/server";
import { hasFeature } from "@/lib/featureFlags/evaluator";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { TIC_TAC_TOE_FEATURE_KEY } from "@/lib/tic-tac-toe/constants";
import { getTicTacToeSettings } from "@/lib/tic-tac-toe/repository";
import {
  handleTicTacToeRouteError,
  ticTacToeOk,
} from "@/lib/tic-tac-toe/apiResponses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return ticTacToeOk({
        featureEnabled: false,
        isEnabled: false,
        winPrizeDing: 0,
        dailyWinCap: 0,
        placements: [],
      });
    }

    const settings = await getTicTacToeSettings();
    const featureEnabled = await hasFeature(user.id, TIC_TAC_TOE_FEATURE_KEY);

    return ticTacToeOk({
      ...settings,
      featureEnabled,
    });
  } catch (err) {
    return handleTicTacToeRouteError(err);
  }
}
