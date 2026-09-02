import { NextRequest, NextResponse } from "next/server";
import { resolveAdminDashboardRequestAuth } from "@/lib/auth/resolveAdminDashboardRequestAuth";
import { loadOperatorDashboardSnapshot } from "@/lib/dashboard/loadOperatorDashboardSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await resolveAdminDashboardRequestAuth(request);
    const data = await loadOperatorDashboardSnapshot(supabase);

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Session required" },
        { status: 401 }
      );
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "Agent dashboard access required" },
        { status: 403 }
      );
    }

    console.error("[DashboardSnapshot] operator snapshot unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: msg },
      { status: 500 }
    );
  }
}
