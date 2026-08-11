import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  DEFAULT_BUY_RIAL_PRESET_AMOUNTS_RIAL,
  getActiveBuyRialAmountsRial,
} from "@/lib/deposit/buyRialPresets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/player/deposit/rial-presets
 * Snapshot of active Buy Rial picker amounts (PostgreSQL).
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
      console.warn(
        "[Deposit] rial-presets snapshot: pg unavailable, using defaults"
      );
      return NextResponse.json({
        ok: true,
        data: {
          amountsRial: [...DEFAULT_BUY_RIAL_PRESET_AMOUNTS_RIAL],
          source: "default",
        },
      });
    }

    const amountsRial = await getActiveBuyRialAmountsRial(pgPool);
    return NextResponse.json({
      ok: true,
      data: {
        amountsRial,
        source: "postgres",
      },
    });
  } catch (err) {
    console.error("[Deposit] GET rial-presets failed", err);
    return NextResponse.json({
      ok: true,
      data: {
        amountsRial: [...DEFAULT_BUY_RIAL_PRESET_AMOUNTS_RIAL],
        source: "default_fallback",
      },
    });
  }
}
