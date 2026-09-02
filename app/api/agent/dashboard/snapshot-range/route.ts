import { NextRequest, NextResponse } from "next/server";
import { resolveAdminDashboardRequestAuth } from "@/lib/auth/resolveAdminDashboardRequestAuth";
import { loadOperatorRangeSnapshotSummary } from "@/lib/dashboard/loadOperatorDashboardPeriodSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/agent/dashboard/snapshot-range?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
 *
 * Closed snapshot aggregates for agent/super dashboard range tab.
 * Uses 08:00 Asia/Tehran boundaries: [fromDate 08:00, toDate 08:00).
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, supabase } = await resolveAdminDashboardRequestAuth(request);

    const fromDate = String(request.nextUrl.searchParams.get("fromDate") || "").trim();
    const toDate = String(request.nextUrl.searchParams.get("toDate") || "").trim();

    if (!fromDate || !toDate) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "fromDate و toDate الزامی است." },
        { status: 400 }
      );
    }

    if (fromDate >= toDate) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "بازه تاریخ نامعتبر است. پایان باید بعد از شروع باشد (مرز ۰۸:۰۰ تهران).",
        },
        { status: 400 }
      );
    }

    const { data: dbUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    const roleRaw = String(dbUser?.role ?? "").toLowerCase();
    if (roleRaw !== "agent" && roleRaw !== "super") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "Agent dashboard access required" },
        { status: 403 }
      );
    }

    const data = await loadOperatorRangeSnapshotSummary({
      supabase,
      operatorId: userId,
      role: roleRaw as "agent" | "super",
      fromDate,
      toDate,
    });

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "بازه تاریخ نامعتبر است. پایان باید بعد از شروع باشد (مرز ۰۸:۰۰ تهران).",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Session required" },
        { status: 401 }
      );
    }

    console.error("[DashboardSnapshot] operator snapshot-range unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: msg },
      { status: 500 }
    );
  }
}
