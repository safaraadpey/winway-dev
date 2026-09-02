import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import { canViewManagedUserStats } from "@/lib/auth/canViewManagedUserStats";
import { loadPerformanceDailyStatsSum } from "@/lib/dashboard/loadPerformanceDailyStatsSum";
import type { PerformanceLifetimeRole } from "@/lib/dashboard/loadPerformanceLifetimeStats";
import {
  getTehranSnapshotDateRangeFromBounds,
  getTehranWeekSnapshotDateRange,
} from "@/lib/dashboard/tehranAccountingWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES = new Set<PerformanceLifetimeRole>(["player", "agent", "super", "admin"]);

/**
 * GET /api/admin/users/snapshot-period-activity?userId=...&role=player|agent|super|admin&period=week
 * GET /api/admin/users/snapshot-period-activity?userId=...&role=player|agent|super|admin&period=range&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
 *
 * Closed snapshot aggregates from performance_daily_stats (no live tail).
 * Range uses 08:00 Asia/Tehran boundaries: [fromDate 08:00, toDate 08:00).
 */
export async function GET(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);
    if (!["admin", "super", "agent"].includes(session.role)) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی کافی نیست." },
        { status: 403 }
      );
    }

    const userId = String(request.nextUrl.searchParams.get("userId") || "").trim();
    const roleParam = String(request.nextUrl.searchParams.get("role") || "").trim() as PerformanceLifetimeRole;
    const period = String(request.nextUrl.searchParams.get("period") || "").trim();

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "userId الزامی است." },
        { status: 400 }
      );
    }

    if (!VALID_ROLES.has(roleParam)) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "role نامعتبر است." },
        { status: 400 }
      );
    }

    const fromDate = String(request.nextUrl.searchParams.get("fromDate") || "").trim();
    const toDate = String(request.nextUrl.searchParams.get("toDate") || "").trim();

    if (period !== "week" && period !== "range") {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "period پشتیبانی‌شده: week | range" },
        { status: 400 }
      );
    }

    if (period === "range" && (!fromDate || !toDate)) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "fromDate و toDate برای period=range الزامی است." },
        { status: 400 }
      );
    }

    const allowed = await canViewManagedUserStats(
      supabase,
      session.user.id,
      session.role,
      userId
    );
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "اجازه مشاهده آمار این کاربر را ندارید." },
        { status: 403 }
      );
    }

    const { data: targetUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (!targetUser || targetUser.role !== roleParam) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "نقش کاربر با درخواست هم‌خوانی ندارد." },
        { status: 400 }
      );
    }

    const bounds =
      period === "week"
        ? getTehranWeekSnapshotDateRange()
        : getTehranSnapshotDateRangeFromBounds(fromDate, toDate);

    if (!bounds) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "بازه تاریخ نامعتبر است. پایان باید بعد از شروع باشد (مرز ۰۸:۰۰ تهران).",
        },
        { status: 400 }
      );
    }

    const { fromSnapshotDate, throughSnapshotDate } = bounds;
    const data = await loadPerformanceDailyStatsSum({
      userId,
      role: roleParam,
      fromSnapshotDate,
      throughSnapshotDate,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...data,
          fromSnapshotDate,
          throughSnapshotDate,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "جلسه معتبر نیست." },
        { status: 401 }
      );
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی کافی نیست." },
        { status: 403 }
      );
    }
    console.error("[UserAccount] snapshot-period-activity unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: message || "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}
