import { NextResponse } from "next/server";
import { pgPool } from "@/lib/pg";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import { isDepositHttpIngressAllowed } from "@/lib/deposit/flag";
import { reconcilePendingHamiPayDeposits } from "@/lib/deposit/hamipayFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/deposit-reconcile
 * Auth: Bearer CRON_SECRET or admin JWT.
 * Re-queries HamiPay for stuck pending deposits and credits idempotently.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  let authorized = false;
  if (cronSecret && bearer && bearer === cronSecret) {
    authorized = true;
  } else {
    try {
      const ctx = await getAdminContextOrThrow(request);
      if (ctx.session.role === "admin") authorized = true;
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isDepositHttpIngressAllowed()) {
    return NextResponse.json(
      { error: "deposit_disabled", message: "Deposit domain disabled." },
      { status: 503 }
    );
  }

  if (!pgPool) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  console.log("[DepositReconcile] cron started");
  const summary = await reconcilePendingHamiPayDeposits(pgPool, { limit: 50 });
  console.log("[DepositReconcile] cron done", summary);

  return NextResponse.json({ ok: true, summary });
}
