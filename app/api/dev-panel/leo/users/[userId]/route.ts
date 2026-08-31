import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";
import { parseLeoUserConfigPayload } from "@/lib/dev-panel/leoPayloadValidation";
import { loadLeoUserDetail, saveLeoUserConfig } from "@/services/dev-panel/leo";
import type { LeoSaveUserConfigPayload } from "@/src/types/leo";

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
  if (message === "conflict_dev_player_active") {
    return NextResponse.json(
      {
        ok: false,
        error: "conflict_dev_player_active",
        message:
          "این کاربر در Dev Player فعال است. برای فعال‌سازی لئو ابتدا Dev Player را غیرفعال کنید.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: false, error: "unexpected_error", message }, { status: 500 });
}

function parsePayload(body: unknown): LeoSaveUserConfigPayload {
  return parseLeoUserConfigPayload(body);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    await getDevPanelContextOrThrow(request);
    const { userId } = await context.params;
    const data = await loadLeoUserDetail(userId);
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "user not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[Leo] GET user detail error:", err);
    return devPanelErrorResponse(err);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { session } = await getDevPanelContextOrThrow(request);
    const { userId } = await context.params;
    const body = await request.json();
    const payload = parsePayload(body);
    const data = await saveLeoUserConfig({
      userId,
      payload,
      updatedBy: session.user.id,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[Leo] PATCH user config error:", err);
    return devPanelErrorResponse(err);
  }
}
