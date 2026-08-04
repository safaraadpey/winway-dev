import { NextRequest, NextResponse } from "next/server";
import {
  AdminPanelAccessError,
  assertAdminPanelAccess,
} from "@/lib/auth/adminPanelAccessServer";
import { resolveAdminDashboardRequestAuth } from "@/lib/auth/resolveAdminDashboardRequestAuth";
import { loadAdminDashboardSnapshot } from "@/lib/dashboard/loadAdminDashboardSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { userId, supabase } = await resolveAdminDashboardRequestAuth(request);
    await assertAdminPanelAccess(userId);

    const data = await loadAdminDashboardSnapshot(supabase);

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
    if (msg === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "Admin dashboard access required" },
        { status: 403 }
      );
    }

    console.error("[DashboardSnapshot] unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: msg },
      { status: 500 }
    );
  }
}
