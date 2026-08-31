import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";
import { loadRegistrationCampaignDetail } from "@/services/dev-panel/tournament-register";

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await getDevPanelContextOrThrow(request);
    const { id } = await context.params;
    const campaignId = String(id ?? "").trim();

    if (!campaignId) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "campaign id is required" },
        { status: 400 }
      );
    }

    const data = await loadRegistrationCampaignDetail(campaignId);
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "campaign not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[DevRegister] GET campaign detail error:", err);
    return devPanelErrorResponse(err);
  }
}
