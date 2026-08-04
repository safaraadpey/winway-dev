import { NextRequest, NextResponse } from "next/server";
import {
  getAdminContextOrThrow,
  logAdminAction,
  verifyManagerAccess,
} from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  DEFAULT_BEP20_CONFIRMATIONS,
  DEFAULT_TRON_CONFIRMATIONS,
  getCryptoXpubSettings,
  maskXpub,
  saveCryptoXpubSettings,
} from "@dingmoney/deposit-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireSuperAdmin(request: NextRequest) {
  const ctx = await getAdminContextOrThrow(request);
  if (ctx.session.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  const isSuper = await verifyManagerAccess(ctx.session.user.id);
  if (!isSuper) {
    throw new Error("FORBIDDEN_SUPER_ADMIN");
  }
  return ctx;
}

function mapResponse(settings: Awaited<ReturnType<typeof getCryptoXpubSettings>>) {
  return {
    bep20Xpub: settings.bep20Xpub,
    trc20Xpub: settings.trc20Xpub,
    bep20XpubMasked: maskXpub(settings.bep20Xpub),
    trc20XpubMasked: maskXpub(settings.trc20Xpub),
    bep20Confirmations: settings.bep20Confirmations,
    tronConfirmations: settings.tronConfirmations,
    updatedAt: settings.updatedAt,
  };
}

/**
 * GET /api/admin/crypto-payment/xpub — Super Admin only
 */
export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    if (!pgPool) {
      return NextResponse.json(
        { ok: false, error: "db_unavailable" },
        { status: 503 }
      );
    }
    const settings = await getCryptoXpubSettings(pgPool);
    return NextResponse.json({ ok: true, data: mapResponse(settings) });
  } catch (err: any) {
    if (err?.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
    if (
      err?.message === "FORBIDDEN" ||
      err?.message === "FORBIDDEN_SUPER_ADMIN"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "forbidden",
          message: "فقط مدیر کل به XPUB دسترسی دارد.",
        },
        { status: 403 }
      );
    }
    console.error("[Payment] GET crypto xpub failed", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/crypto-payment/xpub
 * Body: { bep20Xpub, trc20Xpub, bep20Confirmations?, tronConfirmations? }
 */
export async function PUT(request: NextRequest) {
  try {
    const { session, supabase } = await requireSuperAdmin(request);
    if (!pgPool) {
      return NextResponse.json(
        { ok: false, error: "db_unavailable" },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const bep20Xpub = String(body?.bep20Xpub ?? "").trim();
    const trc20Xpub = String(body?.trc20Xpub ?? "").trim();
    const bep20Confirmations = Number(
      body?.bep20Confirmations ?? DEFAULT_BEP20_CONFIRMATIONS
    );
    const tronConfirmations = Number(
      body?.tronConfirmations ?? DEFAULT_TRON_CONFIRMATIONS
    );

    if (!bep20Xpub || !trc20Xpub) {
      return NextResponse.json(
        {
          ok: false,
          error: "xpub_required",
          message: "هر دو XPUB الزامی هستند.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(bep20Confirmations) ||
      bep20Confirmations < 1 ||
      bep20Confirmations > 256 ||
      !Number.isFinite(tronConfirmations) ||
      tronConfirmations < 1 ||
      tronConfirmations > 256
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_confirmations",
          message: "تعداد تأییدیه باید بین ۱ تا ۲۵۶ باشد.",
        },
        { status: 400 }
      );
    }

    const saved = await saveCryptoXpubSettings(pgPool, {
      bep20Xpub,
      trc20Xpub,
      bep20Confirmations,
      tronConfirmations,
      updatedBy: session.user.id,
    });

    await logAdminAction(
      supabase,
      session.user.id,
      "crypto_payment.xpub.update",
      "deposit.crypto_xpub_settings",
      null,
      {
        bep20Masked: maskXpub(bep20Xpub),
        trc20Masked: maskXpub(trc20Xpub),
        bep20Confirmations: saved.bep20Confirmations,
        tronConfirmations: saved.tronConfirmations,
      },
      request
    );

    return NextResponse.json({ ok: true, data: mapResponse(saved) });
  } catch (err: any) {
    if (err?.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
    if (
      err?.message === "FORBIDDEN" ||
      err?.message === "FORBIDDEN_SUPER_ADMIN"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "forbidden",
          message: "فقط مدیر کل می‌تواند XPUB را ویرایش کند.",
        },
        { status: 403 }
      );
    }
    if (
      typeof err?.message === "string" &&
      (err.message.includes("_xpub") || err.message === "derivation_failed")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_xpub",
          message: "فرمت XPUB نامعتبر است.",
        },
        { status: 400 }
      );
    }
    console.error("[Payment] PUT crypto xpub failed", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error" },
      { status: 500 }
    );
  }
}
