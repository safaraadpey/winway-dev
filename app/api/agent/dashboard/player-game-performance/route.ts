import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import {
  loadOperatorPlayerGamePerformanceByPeriod,
  loadOperatorPlayerGamePerformanceInRange,
  type OperatorPlayerGameRole,
} from "@/lib/dashboard/loadOperatorPlayerGamePerformance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function operatorRoleFromSession(role: string): OperatorPlayerGameRole | null {
  if (role === "agent" || role === "super") return role;
  return null;
}

/**
 * GET /api/agent/dashboard/player-game-performance
 * GET /api/agent/dashboard/player-game-performance?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Snapshot of downline player winnings/purchases for agent or super dashboards.
 * Source of truth: PostgreSQL (same formula as player leaderboard سوابق).
 */
export async function GET(request: NextRequest) {
  try {
    const { session } = await getAdminContextOrThrow(request);
    const operatorRole = operatorRoleFromSession(session.role);
    if (!operatorRole) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "فقط ایجنت یا سوپر می‌تواند این آمار را ببیند." },
        { status: 403 }
      );
    }

    const fromStr = request.nextUrl.searchParams.get("from");
    const toStr = request.nextUrl.searchParams.get("to");
    const operatorId = session.user.id;

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

      const data = await loadOperatorPlayerGamePerformanceInRange({
        operatorId,
        role: operatorRole,
        fromIso: from.toISOString(),
        toIso: to.toISOString(),
      });

      return NextResponse.json({ ok: true, data }, { status: 200 });
    }

    const data = await loadOperatorPlayerGamePerformanceByPeriod({
      operatorId,
      role: operatorRole,
    });

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

    console.error("[Dashboard] player-game-performance unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: message || "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}
