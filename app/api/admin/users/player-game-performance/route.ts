import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import { canViewManagedUserStats } from "@/lib/auth/canViewManagedUserStats";
import {
  loadPlayerGamePerformanceByPeriod,
  loadPlayerGamePerformanceInRange,
} from "@/lib/dashboard/loadOperatorPlayerGamePerformance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users/player-game-performance?userId=...
 * GET /api/admin/users/player-game-performance?userId=...&fromIso=...&toIso=...
 *
 * Snapshot of one player's winnings/purchases (leaderboard سوابق formula).
 * Source of truth: PostgreSQL.
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
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "userId الزامی است." },
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

    const fromIsoParam = request.nextUrl.searchParams.get("fromIso");
    const toIsoParam = request.nextUrl.searchParams.get("toIso");

    if (fromIsoParam || toIsoParam) {
      if (!fromIsoParam || !toIsoParam) {
        return NextResponse.json(
          { ok: false, error: "validation_error", message: "fromIso و toIso هر دو الزامی هستند." },
          { status: 400 }
        );
      }
      const fromIso = new Date(fromIsoParam);
      const toIso = new Date(toIsoParam);
      if (
        !Number.isFinite(fromIso.getTime()) ||
        !Number.isFinite(toIso.getTime()) ||
        fromIso > toIso
      ) {
        return NextResponse.json(
          { ok: false, error: "validation_error", message: "بازه زمانی نامعتبر است." },
          { status: 400 }
        );
      }

      const data = await loadPlayerGamePerformanceInRange({
        playerId: userId,
        fromIso: fromIso.toISOString(),
        toIso: toIso.toISOString(),
      });
      return NextResponse.json({ ok: true, data }, { status: 200 });
    }

    const fromStr = request.nextUrl.searchParams.get("from");
    const toStr = request.nextUrl.searchParams.get("to");

    if (fromStr || toStr) {
      if (!fromStr || !toStr) {
        return NextResponse.json(
          { ok: false, error: "validation_error", message: "برای بازه، تاریخ از/تا الزامی است." },
          { status: 400 }
        );
      }
      const from = new Date(`${fromStr}T00:00:00.000Z`);
      const to = new Date(`${toStr}T23:59:59.999Z`);
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
        return NextResponse.json(
          { ok: false, error: "validation_error", message: "بازه تاریخ نامعتبر است." },
          { status: 400 }
        );
      }

      const data = await loadPlayerGamePerformanceInRange({
        playerId: userId,
        fromIso: from.toISOString(),
        toIso: to.toISOString(),
      });
      return NextResponse.json({ ok: true, data }, { status: 200 });
    }

    const data = await loadPlayerGamePerformanceByPeriod({ playerId: userId });
    return NextResponse.json({ ok: true, data }, { status: 200 });
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
    console.error("[UserAccount] player-game-performance unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: message || "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}
