import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";
import { scheduleTournamentRegistration } from "@/services/dev-panel/tournament-register";

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

export async function POST(request: NextRequest) {
  try {
    const { session } = await getDevPanelContextOrThrow(request);
    const body = await request.json();

    const tournamentId = String(body?.tournamentId ?? "").trim();
    const operatorId = body?.operatorId ? String(body.operatorId).trim() : undefined;
    const name = body?.name ? String(body.name).trim() : undefined;
    const registrationOpenTime = body?.registrationOpenTime
      ? String(body.registrationOpenTime).trim()
      : undefined;
    const items = Array.isArray(body?.items)
      ? body.items
          .map((item: { userId?: unknown; scheduledAt?: unknown }) => ({
            userId: String(item?.userId ?? "").trim(),
            scheduledAt: String(item?.scheduledAt ?? "").trim(),
          }))
          .filter((item: { userId: string; scheduledAt: string }) => item.userId && item.scheduledAt)
      : [];

    if (!tournamentId || items.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "tournamentId and items are required",
        },
        { status: 400 }
      );
    }

    const data = await scheduleTournamentRegistration({
      tournamentId,
      createdBy: session.user.id,
      operatorId,
      name,
      registrationOpenTime,
      items,
    });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[DevRegister] POST schedule error:", err);
    return devPanelErrorResponse(err);
  }
}
