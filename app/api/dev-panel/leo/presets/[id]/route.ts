import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";
import { deleteLeoPreset } from "@/services/dev-panel/leo";

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
  if (message === "preset not found") {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "پریست یافت نشد" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: false, error: "unexpected_error", message }, { status: 500 });
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
