import { NextRequest, NextResponse } from "next/server";
import {
  AdminPanelAccessError,
  assertAdminPanelAccess,
} from "@/lib/auth/adminPanelAccessServer";
import { resolveAdminDashboardRequestAuth } from "@/lib/auth/resolveAdminDashboardRequestAuth";
import { loadPanelCommissionBreakdownInRange } from "@/lib/dashboard/loadPanelCommissionBreakdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { userId, supabase } = await resolveAdminDashboardRequestAuth(request);
    await assertAdminPanelAccess(userId);

    const fromStr = request.nextUrl.searchParams.get("from");
    const toStr = request.nextUrl.searchParams.get("to");
    if (!fromStr || !toStr) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "from and to are required" },
        { status: 400 }
      );
    }

    const from = new Date(`${fromStr}T00:00:00.000Z`);
    const to = new Date(`${toStr}T23:59:59.999Z`);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "invalid date range" },
        { status: 400 }
      );
    }

    const data = await loadPanelCommissionBreakdownInRange(
      from.toISOString(),
      to.toISOString(),
      supabase
    );

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err) {
    if (err instanceof AdminPanelAccessError) {
      const status =
        err.code === "UNAUTHORIZED" ? 401 : err.code === "FORBIDDEN_DEV_PANEL" ? 403 : 403;
      return NextResponse.json(
        { ok: false, error: err.code.toLowerCase(), message: err.message },
        { status }
      );
    }

    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Session required" },
        { status: 401 }
      );
    }

    console.error("[Dashboard] panel-operators unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: msg },
      { status: 500 }
    );
  }
}
