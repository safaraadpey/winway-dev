import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";
import { parseLeoBandCapsPayload } from "@/lib/dev-panel/leoPayloadValidation";
import { saveLeoBandCaps } from "@/services/dev-panel/leo";

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
  if (message.startsWith("invalid") || message.includes("must be") || message.includes("required")) {
    return NextResponse.json({ ok: false, error: "validation_error", message }, { status: 400 });
  }
  return NextResponse.json({ ok: false, error: "unexpected_error", message }, { status: 500 });
}

export async function PUT(request: NextRequest) {
  try {
    await getDevPanelContextOrThrow(request);
    const body = await request.json();
    const { bands, maxLeoPlayersPerWaitingRoom, maxLeoCardsPerJoin } = parseLeoBandCapsPayload(body);
    const data = await saveLeoBandCaps(bands, maxLeoPlayersPerWaitingRoom, maxLeoCardsPerJoin);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[Leo] PUT band caps error:", err);
    return devPanelErrorResponse(err);
  }
}
