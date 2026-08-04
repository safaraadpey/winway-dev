import { NextResponse } from "next/server";
import { pgPool } from "@/lib/pg";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import { runFullOfflineCryptoScan } from "@dingmoney/deposit-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["dub1", "fra1"];
export const maxDuration = 300;

async function authorize(request: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (cronSecret && bearer && bearer === cronSecret) return true;
  try {
    const ctx = await getAdminContextOrThrow(request);
    return ctx.session.role === "admin";
  } catch {
    return false;
  }
}

/**
 * POST /api/cron/crypto-scan-all
 *
 * Optional manual/admin endpoint for Layer 3 offline scan (single page).
 * Production auto-scan (paginated) runs on Railway: apps/workers/crypto-deposit
 * (runFullOfflineCryptoScan on CRYPTO_FULL_SCAN_INTERVAL_MS).
 *
 * Auth: Bearer CRON_SECRET or admin JWT.
 * Body optional: { limit?: number, offset?: number }
 */
export async function POST(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pgPool) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  let limit = 200;
  let offset = 0;
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.limit) limit = Math.min(500, Number(body.limit) || 200);
    if (body?.offset) offset = Math.max(0, Number(body.offset) || 0);
  } catch {
    /* empty body ok */
  }

  console.log("[Payment] manual crypto-scan-all started", { limit, offset });
  const summary = await runFullOfflineCryptoScan(pgPool, { limit, offset });
  console.log("[Payment] manual crypto-scan-all done", {
    targets: summary.targets,
  });

  return NextResponse.json({
    ok: true,
    targets: summary.targets,
    confirmed: summary.scans.reduce(
      (n, s) => n + s.results.filter((r) => r.action === "confirmed").length,
      0
    ),
  });
}

/** Same auth + handler as POST (manual trigger). */
export async function GET(request: Request) {
  return POST(request);
}
