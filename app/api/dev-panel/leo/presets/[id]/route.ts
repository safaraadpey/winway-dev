import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";
import { parseLeoPresetName } from "@/lib/dev-panel/leoPayloadValidation";
import { deleteLeoPreset, renameLeoPreset } from "@/services/dev-panel/leo";

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
  if (message === "preset not found") {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "پریست یافت نشد" },
      { status: 404 }
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
  return NextResponse.json({ ok: false, error: "unexpected_error", message }, { status: 500 });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await getDevPanelContextOrThrow(request);
    const { id } = await context.params;
    const body = await request.json();
    const name = parseLeoPresetName(body);
    const data = await renameLeoPreset({ presetId: id, name });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[Leo] PATCH preset error:", err);
    return devPanelErrorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await getDevPanelContextOrThrow(request);
    const { id } = await context.params;
    await deleteLeoPreset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Leo] DELETE preset error:", err);
    return devPanelErrorResponse(err);
  }
}
