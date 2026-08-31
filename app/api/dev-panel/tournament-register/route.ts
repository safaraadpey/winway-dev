import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";
import { loadTournamentRegisterOverview } from "@/services/dev-panel/tournament-register";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function devPanelErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "unexpected error";
  if (message === "UNAUTHORIZED") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "missing or invalid session" },
      { status: 401 }
    );
  }
  if (message === "FORBIDDEN" || message === "FORBIDDEN_DEV_PANEL") {
    return NextResponse.json(
      { ok: false, error: "forbidden", message: "dev panel access required" },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: false, error: "unexpected_error", message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await getDevPanelContextOrThrow(request);
    const data = await loadTournamentRegisterOverview();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[DevRegister] GET /api/dev-panel/tournament-register error:", err);
    return devPanelErrorResponse(err);
  }
}
