/**
 * POST /api/cron/finance-reconcile
 * Auth: Authorization: Bearer ${CRON_SECRET} or admin JWT.
 * Report-only — never repairs balances.
 */
import { NextRequest, NextResponse } from "next/server";
import { runFinanceReconciliation } from "@/lib/finance/reconcile";
import { getAdminJwtContextOrThrow } from "@/lib/supabaseServer";

async function authorize(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  try {
    const ctx = await getAdminJwtContextOrThrow(request);
    return ctx.role === "admin" || ctx.role === "super";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await runFinanceReconciliation();
    return NextResponse.json({
      ok: result.status === "ok",
      ...result,
    });
  } catch (err: any) {
    console.error("[Wallet] finance recon endpoint failed:", err?.message);
    return NextResponse.json(
      { ok: false, error: "recon_failed", message: err?.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
