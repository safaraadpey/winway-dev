import { NextResponse } from "next/server";
import { pgPool } from "@/lib/pg";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import { runActiveCryptoScan } from "@dingmoney/deposit-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["dub1", "fra1"];
export const maxDuration = 120;

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
 * POST /api/cron/crypto-scan-active
 *
 * Optional manual/admin endpoint for Layer 2 active-address scan.
 * Production auto-scan runs on Railway: apps/workers/crypto-deposit
 * (runActiveCryptoScan on CRYPTO_ACTIVE_SCAN_INTERVAL_MS).
 *
 * Auth: Bearer CRON_SECRET or admin JWT.
 */
export async function POST(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pgPool) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  console.log("[Payment] manual crypto-scan-active started");
  const summary = await runActiveCryptoScan(pgPool);
  console.log("[Payment] manual crypto-scan-active done", {
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
