import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    await getDevPanelContextOrThrow(request);

    void params;
    void request;

    return NextResponse.json(
      {
        ok: false,
        error: "gone",
        message:
          "Per-player Dev Player settings were removed. Assign players via Dev Player profiles in settings.",
      },
      { status: 410 }
    );
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "missing or invalid session" },
        { status: 401 }
      );
    }
    if (err.message === "FORBIDDEN" || err.message === "FORBIDDEN_DEV_PANEL") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "dev panel access required" },
        { status: 403 }
      );
    }

    console.error("PATCH /api/dev-panel/dev-players/[userId] error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
