import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  getPlayerWalletFreeBalance,
  listPlayerWithdrawalRequests,
} from "@/lib/withdrawal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/player/withdrawal/list — snapshot of player's withdrawal requests + free balance.
 */
export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "ورود لازم است." },
      { status: 401 }
    );
  }

  if (!pgPool) {
    return NextResponse.json(
      { error: "db_unavailable", message: "پایگاه‌داده در دسترس نیست." },
      { status: 503 }
    );
  }

  try {
    const [requests, freeBalance] = await Promise.all([
      listPlayerWithdrawalRequests(pgPool, user.id, 20),
      getPlayerWalletFreeBalance(pgPool, user.id),
    ]);

    return NextResponse.json({
      ok: true,
      freeBalance,
      requests,
    });
  } catch (err) {
    console.error("[Withdrawal] List failed", { playerId: user.id, err });
    return NextResponse.json(
      { error: "internal_error", message: "بارگذاری درخواست‌ها ناموفق بود." },
      { status: 500 }
    );
  }
}
