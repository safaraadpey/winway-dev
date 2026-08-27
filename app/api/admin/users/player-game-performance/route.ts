import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import type { createServiceClient } from "@/lib/supabaseServer";
import {
  loadPlayerGamePerformanceByPeriod,
  loadPlayerGamePerformanceInRange,
} from "@/lib/dashboard/loadOperatorPlayerGamePerformance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServiceClient = ReturnType<typeof createServiceClient>;

async function canViewPlayerStats(
  supabase: ServiceClient,
  actorId: string,
  actorRole: string,
  targetUserId: string
): Promise<boolean> {
  if (actorRole === "admin") return true;
  if (actorRole !== "agent" && actorRole !== "super") return false;

  const { data: target } = await supabase
    .from("users")
    .select("id, role, parent_id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!target || target.role !== "player") return false;
  if (target.parent_id === actorId) return true;

  const { data: affiliation } = await supabase
    .from("player_affiliation")
    .select("agent_id, super_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (actorRole === "agent") {
    return affiliation?.agent_id === actorId;
  }

  if (affiliation?.super_id === actorId) return true;
  if (affiliation?.agent_id) {
    const { data: agentUser } = await supabase
      .from("users")
      .select("parent_id")
      .eq("id", affiliation.agent_id)
      .maybeSingle();
    if (agentUser?.parent_id === actorId) return true;
  }

  if (target.parent_id) {
    const { data: parentUser } = await supabase
      .from("users")
      .select("role, parent_id")
      .eq("id", target.parent_id)
      .maybeSingle();
    if (parentUser?.role === "agent" && parentUser.parent_id === actorId) return true;
  }

  return false;
}

/**
 * GET /api/admin/users/player-game-performance?userId=...
 * GET /api/admin/users/player-game-performance?userId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
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

    const allowed = await canViewPlayerStats(supabase, session.user.id, session.role, userId);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "اجازه مشاهده آمار این کاربر را ندارید." },
        { status: 403 }
      );
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
