import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  createCryptoWithdrawalRequest,
  getPlayerWalletFreeBalance,
} from "@/lib/withdrawal/service";
import {
  calculateCryptoWithdrawQuote,
  getCryptoReferencePrices,
  isCryptoWithdrawQuoteFresh,
  validateCryptoWalletAddress,
  type CryptoNetwork,
} from "@dingmoney/deposit-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/player/withdrawal/create-crypto
 */
export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "ورود لازم است." },
      { status: 401 }
    );
  }

  if (!pgPool) {
    return NextResponse.json(
      { error: "db_unavailable", message: "پایگاه‌داده در دسترس نیست." },
      { status: 503 }
    );
  }

  let body: {
    network?: string;
    cryptoAmount?: number;
    cryptoSymbol?: string;
    lockedToman?: number;
    requestedToman?: number;
    walletAddress?: string;
    clientRequestId?: string;
    quotedAt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "درخواست نامعتبر است." },
      { status: 400 }
    );
  }

  const network = String(body.network || "").toUpperCase() as CryptoNetwork;
  const cryptoAmount = Number(body.cryptoAmount);
  const lockedToman = Number(body.lockedToman);
  const requestedToman = Number(body.requestedToman);
  const cryptoSymbol = String(body.cryptoSymbol || "").toUpperCase() as "USDT" | "TRX";
  const walletAddress = String(body.walletAddress || "").trim();
  const clientRequestId = String(body.clientRequestId || "").trim();
  const quotedAt = String(body.quotedAt || "").trim();

  if (!clientRequestId) {
    return NextResponse.json(
      { error: "client_request_id_required", message: "شناسه درخواست الزامی است." },
      { status: 400 }
    );
  }

  if (!quotedAt || !isCryptoWithdrawQuoteFresh(quotedAt)) {
    return NextResponse.json(
      { error: "quote_expired", message: "نرخ تبدیل منقضی شده. دوباره تبدیل کنید." },
      { status: 400 }
    );
  }

  if (!validateCryptoWalletAddress(network, walletAddress)) {
    return NextResponse.json(
      { error: "invalid_wallet_address", message: "آدرس کیف پول نامعتبر است." },
      { status: 400 }
    );
  }

  try {
    const rates = await getCryptoReferencePrices();
    const expected = calculateCryptoWithdrawQuote({
      tomanAmount: requestedToman,
      network,
      rates,
      quotedAt,
    });

    if (
      expected.cryptoAmount !== cryptoAmount ||
      expected.lockedToman !== lockedToman ||
      expected.cryptoSymbol !== cryptoSymbol ||
      expected.requestedToman !== requestedToman
    ) {
      return NextResponse.json(
        {
          error: "quote_mismatch",
          message: "نرخ تبدیل تغییر کرده. لطفاً دوباره تبدیل کنید.",
        },
        { status: 409 }
      );
    }

    const freeBalance = await getPlayerWalletFreeBalance(pgPool, user.id);
    if (lockedToman > freeBalance) {
      return NextResponse.json(
        { error: "insufficient_funds", message: "موجودی کافی نیست." },
        { status: 400 }
      );
    }

    console.log("[Withdrawal] crypto create started", {
      playerId: user.id,
      network,
      lockedToman,
      cryptoAmount,
      clientRequestId,
    });

    const created = await createCryptoWithdrawalRequest(pgPool, {
      playerId: user.id,
      lockedToman,
      requestedToman,
      network,
      cryptoSymbol,
      cryptoAmount,
      walletAddress,
      clientRequestId,
    });

    console.log("[Withdrawal] crypto create completed", {
      playerId: user.id,
      requestId: created.requestId,
      replayed: created.replayed,
    });

    return NextResponse.json({
      ok: true,
      requestId: created.requestId,
      status: created.status,
      statusLabel: "در حال بررسی",
      cryptoAmount,
      cryptoSymbol,
      network,
      lockedToman,
      replayed: created.replayed,
    });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code || "withdrawal_failed")
        : "withdrawal_failed";
    const message =
      err instanceof Error ? err.message : "ثبت درخواست برداشت ناموفق بود.";
    console.error("[Withdrawal] crypto create failed", { playerId: user.id, code });
    return NextResponse.json({ error: code, message }, { status: 400 });
  }
}
