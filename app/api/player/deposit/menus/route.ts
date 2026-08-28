import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import { getPlayerPaymentMenus } from "@/lib/deposit/paymentMenuVisibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/player/deposit/menus
 * Snapshot of which payment menus this player may see (PostgreSQL).
 */
export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    if (!pgPool) {
      console.warn("[Payment] player menus snapshot: pg unavailable, default all");
      return NextResponse.json({
        ok: true,
        data: { walletBuy: true, buyRial: true, source: "default" },
      });
    }

    const menus = await getPlayerPaymentMenus(pgPool, user.id);
    return NextResponse.json({
      ok: true,
      data: {
        walletBuy: menus.walletBuy,
        buyRial: menus.buyRial,
        source: "postgres",
      },
    });
  } catch (err) {
    console.error("[Payment] GET player menus failed", err);
    return NextResponse.json({
      ok: true,
      data: { walletBuy: true, buyRial: true, source: "default_fallback" },
    });
  }
}
