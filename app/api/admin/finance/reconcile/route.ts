/**
 * POST /api/admin/finance/reconcile — run wallet↔ledger + conservation recon (report only)
 */
import { NextRequest, NextResponse } from "next/server";
import { financeMetricsSnapshot } from "@/lib/finance/metrics";
import { runFinanceReconciliation } from "@/lib/finance/reconcile";
import { getAdminJwtContextOrThrow } from "@/lib/supabaseServer";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAdminJwtContextOrThrow(request);
    if (ctx.role !== "admin" && ctx.role !== "super") {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }
    const result = await runFinanceReconciliation();
    return NextResponse.json({
      ok: result.status === "ok",
      metrics: financeMetricsSnapshot(),
      ...result,
    });
  } catch (err: any) {
    if (err?.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "recon_failed", message: err?.message },
      { status: 500 }
    );
  }
}
