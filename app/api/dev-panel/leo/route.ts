import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";
import { loadLeoOverview, patchLeoSettings } from "@/services/dev-panel/leo";

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
    const data = await loadLeoOverview();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[Leo] GET /api/dev-panel/leo error:", err);
    return devPanelErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await getDevPanelContextOrThrow(request);
    const body = await request.json();
    const data = await patchLeoSettings({
      systemEnabled:
        body?.systemEnabled === undefined ? undefined : Boolean(body.systemEnabled),
      schedulerEnabled:
        body?.schedulerEnabled === undefined ? undefined : Boolean(body.schedulerEnabled),
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[Leo] PATCH /api/dev-panel/leo error:", err);
    return devPanelErrorResponse(err);
  }
}
