import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow, logAdminAction } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  listBuyRialPresetAmounts,
  replaceBuyRialPresetAmounts,
  type UpsertBuyRialPresetInput,
} from "@/lib/deposit/buyRialPresets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: NextRequest) {
  const ctx = await getAdminContextOrThrow(request);
  if (ctx.session.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return ctx;
}

/**
 * GET /api/admin/crypto-payment/rial-presets
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
    const presets = await listBuyRialPresetAmounts(pgPool, {
      activeOnly: false,
    });
    return NextResponse.json({ ok: true, data: { presets } });
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
    console.error("[Payment] GET buy-rial presets failed", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/crypto-payment/rial-presets
 * Body: { presets: UpsertBuyRialPresetInput[] } — full replace
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
    const rawPresets = body?.presets;
    if (!Array.isArray(rawPresets)) {
      return NextResponse.json(
        {
          ok: false,
          error: "presets_required",
          message: "آرایه presets لازم است.",
        },
        { status: 400 }
      );
    }

    const presets: UpsertBuyRialPresetInput[] = rawPresets.map((p: any) => ({
      id: p.id ? String(p.id) : undefined,
      amountRial: Number(p.amountRial),
      sortOrder: p.sortOrder != null ? Number(p.sortOrder) : undefined,
      isActive: p.isActive !== false,
    }));

    const saved = await replaceBuyRialPresetAmounts(pgPool, presets);

    await logAdminAction(
      supabase,
      session.user.id,
      "payment.rial_presets.replace",
      "deposit.buy_rial_preset_amounts",
      null,
      { count: saved.length },
      request
    );

    console.info("[Payment] buy-rial presets replaced", {
      adminId: session.user.id,
      count: saved.length,
    });

    return NextResponse.json({ ok: true, data: { presets: saved } });
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
        "presets_required",
        "too_many_presets",
        "invalid_amount",
        "duplicate_amount",
      ].includes(err?.message)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          message: "داده‌های ورودی نامعتبر است.",
        },
        { status: 400 }
      );
    }
    console.error("[Payment] PUT buy-rial presets failed", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error" },
      { status: 500 }
    );
  }
}
