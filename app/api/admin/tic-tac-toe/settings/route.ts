import { NextRequest } from "next/server";
import {
  logAdminAction,
  mapAdminApiError,
  requireAdminZeroContext,
} from "@/lib/featureFlags/adminApiHelpers";
import {
  TIC_TAC_TOE_PLACEMENTS,
  type TicTacToePlacement,
} from "@/lib/tic-tac-toe/constants";
import {
  getTicTacToeSettings,
  updateTicTacToeSettings,
} from "@/lib/tic-tac-toe/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePlacements(raw: unknown): TicTacToePlacement[] {
  if (!Array.isArray(raw)) return ["player_settings"];
  const allowed = new Set<string>(TIC_TAC_TOE_PLACEMENTS);
  const parsed = raw.filter(
    (item): item is TicTacToePlacement =>
      typeof item === "string" && allowed.has(item)
  );
  return parsed.length > 0 ? parsed : ["player_settings"];
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminZeroContext(request);
    const settings = await getTicTacToeSettings();
    return Response.json({ ok: true, data: settings });
  } catch (err) {
    return mapAdminApiError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { session, supabase } = await requireAdminZeroContext(request);
    const body = await request.json();

    const settings = await updateTicTacToeSettings({
      isEnabled: Boolean(body?.isEnabled),
      winPrizeDing: Math.max(0, Math.trunc(Number(body?.winPrizeDing ?? 0))),
      dailyWinCap: Math.max(0, Math.trunc(Number(body?.dailyWinCap ?? 0))),
      placements: parsePlacements(body?.placements),
    });

    await logAdminAction(
      supabase,
      session.user.id,
      "tic_tac_toe_settings_update",
      "tic_tac_toe_settings",
      "1",
      settings,
      request
    );

    console.log("[TicTacToe] Admin settings updated", {
      adminUserId: session.user.id,
      settings,
    });

    return Response.json({ ok: true, data: settings });
  } catch (err) {
    return mapAdminApiError(err);
  }
}
