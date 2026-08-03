/**
 * GET /api/admin/finance/metrics — in-process finance integrity counters
 */
import { NextRequest, NextResponse } from "next/server";
import { financeMetricsSnapshot } from "@/lib/finance/metrics";
import { getAdminJwtContextOrThrow } from "@/lib/supabaseServer";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAdminJwtContextOrThrow(request);
    if (ctx.role !== "admin" && ctx.role !== "super") {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }
    return NextResponse.json({
      ok: true,
      metrics: financeMetricsSnapshot(),
    });
  } catch (err: any) {
    if (err?.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message },
      { status: 500 }
    );
  }
}
