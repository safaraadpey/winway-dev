import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow, logAdminAction } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  listCryptoRateTiers,
  replaceCryptoRateTiers,
  type CryptoNetwork,
  type UpsertTierInput,
} from "@/lib/deposit/cryptoInvoice";

export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
  const ctx = await getAdminContextOrThrow(request);
  if (ctx.session.role !== "admin") {
    const err = new Error("FORBIDDEN");
    throw err;
  }
  return ctx;
}

/**
 * GET /api/admin/crypto-payment/tiers
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!pgPool) {
      return NextResponse.json(
        { ok: false, error: "db_unavailable" },
        { status: 503 }
      );
    }
    const tiers = await listCryptoRateTiers(pgPool, { activeOnly: false });
    return NextResponse.json({ ok: true, data: { tiers } });
  } catch (err: any) {
    if (err?.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
    if (err?.message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }
    console.error("[Payment] GET crypto tiers failed", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/crypto-payment/tiers
 * Body: { tiers: UpsertTierInput[] } — full replace (add/edit/remove via rewritten set)
 */
export async function PUT(request: NextRequest) {
  try {
    const { session, supabase } = await requireAdmin(request);
    if (!pgPool) {
      return NextResponse.json(
        { ok: false, error: "db_unavailable" },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const rawTiers = body?.tiers;
    if (!Array.isArray(rawTiers)) {
      return NextResponse.json(
        { ok: false, error: "tiers_required", message: "آرایه tiers لازم است." },
        { status: 400 }
      );
    }

    const tiers: UpsertTierInput[] = rawTiers.map((t: any) => ({
      id: t.id ? String(t.id) : undefined,
      network: String(t.network) as CryptoNetwork,
      minUsd: Number(t.minUsd),
      maxUsd: Number(t.maxUsd),
      multiplier: Number(t.multiplier),
      bonusPercent: Number(t.bonusPercent ?? 0),
      sortOrder: t.sortOrder != null ? Number(t.sortOrder) : undefined,
      isActive: t.isActive !== false,
    }));

    const saved = await replaceCryptoRateTiers(pgPool, tiers);

    await logAdminAction(
      supabase,
      session.user.id,
      "crypto_payment.tiers.replace",
      "deposit.crypto_rate_tiers",
      null,
      { count: saved.length },
      request
    );

    return NextResponse.json({ ok: true, data: { tiers: saved } });
  } catch (err: any) {
    if (err?.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
    if (err?.message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }
    if (
      [
        "tiers_required",
        "invalid_network",
        "invalid_range",
        "invalid_multiplier",
        "invalid_bonus",
      ].includes(err?.message)
    ) {
      return NextResponse.json(
        { ok: false, error: err.message, message: "داده‌های ورودی نامعتبر است." },
        { status: 400 }
      );
    }
    console.error("[Payment] PUT crypto tiers failed", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error" },
      { status: 500 }
    );
  }
}
