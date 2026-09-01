import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";
import { parseLeoPresetName, parseLeoUserConfigPayload } from "@/lib/dev-panel/leoPayloadValidation";
import { createLeoPreset, createLeoPresetFromUser, loadLeoPresets } from "@/services/dev-panel/leo";

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
  if (message === "preset name is required") {
    return NextResponse.json(
      { ok: false, error: "validation_error", message: "نام پریست را وارد کنید" },
      { status: 400 }
    );
  }
  if (message === "preset name already exists") {
    return NextResponse.json(
      { ok: false, error: "validation_error", message: "نام پریست تکراری است" },
      { status: 409 }
    );
  }
  if (message === "preset name too long") {
    return NextResponse.json(
      { ok: false, error: "validation_error", message: "نام پریست حداکثر ۸۰ کاراکتر است" },
      { status: 400 }
    );
  }
  if (message === "user not found") {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "پلیر یافت نشد" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: false, error: "unexpected_error", message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await getDevPanelContextOrThrow(request);
    const data = await loadLeoPresets();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[Leo] GET presets error:", err);
    return devPanelErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session } = await getDevPanelContextOrThrow(request);
    const body = await request.json();
    const name = parseLeoPresetName(body);
    const raw = body as Record<string, unknown>;
    const sourceUserId =
      typeof raw?.sourceUserId === "string" ? String(raw.sourceUserId) : undefined;

    const data =
      sourceUserId && !Array.isArray(raw.activeTimeBands)
        ? await createLeoPresetFromUser({
            name,
            sourceUserId,
            createdBy: session.user.id,
          })
        : await createLeoPreset({
            name,
            payload: parseLeoUserConfigPayload(body),
            sourceUserId,
            createdBy: session.user.id,
          });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[Leo] POST preset error:", err);
    return devPanelErrorResponse(err);
  }
}
