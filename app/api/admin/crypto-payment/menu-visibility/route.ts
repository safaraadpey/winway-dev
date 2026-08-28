import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow, logAdminAction } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  PAYMENT_MENU_KEYS,
  listPaymentMenuAdminSnapshot,
  replacePaymentMenuPolicies,
  type PaymentMenuKey,
  type PaymentMenuMode,
} from "@/lib/deposit/paymentMenuVisibility";

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
 * GET /api/admin/crypto-payment/menu-visibility
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
    const snapshot = await listPaymentMenuAdminSnapshot(pgPool);
    return NextResponse.json({ ok: true, data: snapshot });
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
    console.error("[Payment] GET menu-visibility failed", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/crypto-payment/menu-visibility
 * Body: { menus: { wallet_buy: { mode, operatorIds }, buy_rial: { mode, operatorIds } } }
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
    const rawMenus = body?.menus;
    if (!rawMenus || typeof rawMenus !== "object") {
      return NextResponse.json(
        {
          ok: false,
          error: "menus_required",
          message: "فیلد menus لازم است.",
        },
        { status: 400 }
      );
    }

    const payload = {} as Record<
      PaymentMenuKey,
      { mode: PaymentMenuMode; operatorIds: string[] }
    >;
    for (const key of PAYMENT_MENU_KEYS) {
      const item = rawMenus[key];
      payload[key] = {
        mode: item?.mode === "allowlist" ? "allowlist" : "all",
        operatorIds: Array.isArray(item?.operatorIds)
          ? item.operatorIds.map((id: unknown) => String(id))
          : [],
      };
    }

    const saved = await replacePaymentMenuPolicies(
      pgPool,
      payload,
      session.user.id
    );

    await logAdminAction(
      supabase,
      session.user.id,
      "payment.menu_visibility.replace",
      "deposit.payment_menu_policy",
      null,
      {
        wallet_buy: payload.wallet_buy,
        buy_rial: payload.buy_rial,
      },
      request
    );

    console.info("[Payment] menu visibility replaced", {
      adminId: session.user.id,
      walletBuyMode: payload.wallet_buy.mode,
      walletBuyCount: payload.wallet_buy.operatorIds.length,
      buyRialMode: payload.buy_rial.mode,
      buyRialCount: payload.buy_rial.operatorIds.length,
    });

    return NextResponse.json({ ok: true, data: saved });
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
        "invalid_mode",
        "operator_ids_required",
        "too_many_operators",
        "invalid_operator_id",
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
    console.error("[Payment] PUT menu-visibility failed", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error" },
      { status: 500 }
    );
  }
}
