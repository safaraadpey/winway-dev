import { NextResponse } from "next/server";
import { getAdminJwtContextOrThrow } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import { getPlayersWeeklyPerformance } from "@/lib/player/weeklyPerformance";
import { listPendingWithdrawalsForActor } from "@/lib/withdrawal/service";
import type { WithdrawalKind } from "@/src/types/withdrawal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/withdrawal/pending?kind=rial|crypto
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAdminJwtContextOrThrow(request);
    const role = ctx.role;
    const url = new URL(request.url);
    const kindParam = url.searchParams.get("kind");
    const kind: WithdrawalKind = kindParam === "crypto" ? "crypto" : "rial";

    if (kind === "crypto") {
      if (role !== "admin") {
        return NextResponse.json(
          { error: "forbidden", message: "فقط ادمین می‌تواند برداشت رمز ارزی را ببیند." },
          { status: 403 }
        );
      }
    } else if (role !== "agent" && role !== "admin") {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "فقط ایجنت بالادستی یا ادمین assign‌شده می‌تواند برداشت ریالی را ببیند.",
        },
        { status: 403 }
      );
    }

    if (!pgPool) {
      return NextResponse.json(
        { error: "db_unavailable", message: "پایگاه‌داده در دسترس نیست." },
        { status: 503 }
      );
    }

    const requests = await listPendingWithdrawalsForActor(
      pgPool,
      ctx.user.id,
      role,
      kind,
      ctx.adminSubRole
    );

    const playerIds = [...new Set(requests.map((r) => r.playerId))];
    const performanceMap = await getPlayersWeeklyPerformance(pgPool, playerIds);
    const enrichedRequests = requests.map((req) => {
      const perf = performanceMap.get(req.playerId);
      return {
        ...req,
        playerWeekGamesPlayed: perf?.gamesPlayed ?? 0,
        playerWeekTotalWinnings: perf?.totalWinnings ?? 0,
      };
    });

    console.log("[Withdrawal] Pending list", {
      actorId: ctx.user.id,
      role,
      kind,
      count: enrichedRequests.length,
    });

    return NextResponse.json({ ok: true, kind, requests: enrichedRequests });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "unauthorized", message: "ورود لازم است." },
        { status: 401 }
      );
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "forbidden", message: "دسترسی مجاز نیست." },
        { status: 403 }
      );
    }
    console.error("[Withdrawal] Pending list failed", err);
    return NextResponse.json(
      { error: "internal_error", message: "بارگذاری درخواست‌ها ناموفق بود." },
      { status: 500 }
    );
  }
}
