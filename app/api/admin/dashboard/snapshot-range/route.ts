import { NextRequest, NextResponse } from "next/server";
import {
  AdminPanelAccessError,
  assertAdminPanelAccess,
} from "@/lib/auth/adminPanelAccessServer";
import { resolveAdminDashboardRequestAuth } from "@/lib/auth/resolveAdminDashboardRequestAuth";
import { loadAdminRangeSnapshotSummary } from "@/lib/dashboard/loadAdminDashboardPeriodSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard/snapshot-range?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
 *
 * Closed snapshot aggregates for admin dashboard range tab.
 * Uses 08:00 Asia/Tehran boundaries: [fromDate 08:00, toDate 08:00).
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, supabase } = await resolveAdminDashboardRequestAuth(request);
    await assertAdminPanelAccess(userId);

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

    const data = await loadAdminRangeSnapshotSummary({
      supabase,
      actorUserId: userId,
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

    console.error("[DashboardSnapshot] snapshot-range unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: msg },
      { status: 500 }
    );
  }
}
