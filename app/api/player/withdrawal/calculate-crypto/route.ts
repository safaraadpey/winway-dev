import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import { getPlayerWalletFreeBalance } from "@/lib/withdrawal/service";
import {
  calculateAllCryptoWithdrawQuotes,
  calculateCryptoWithdrawQuote,
  getCryptoReferencePrices,
  type CryptoNetwork,
} from "@dingmoney/deposit-core";
import { takeRateLimitToken } from "@/lib/deposit/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["dub1", "fra1"];

/**
 * POST /api/player/withdrawal/calculate-crypto
 * Body: { tomanAmount, network? , allNetworks?: boolean }
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

  const rate = takeRateLimitToken({
    key: `withdrawal:crypto-quote:${user.id}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "تعداد درخواست‌ها زیاد است." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  let body: { tomanAmount?: number; network?: string; allNetworks?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "درخواست نامعتبر است." },
      { status: 400 }
    );
  }

  const tomanAmount = Number(body.tomanAmount);
  const allNetworks = body.allNetworks === true;
  const network = String(body.network || "").toUpperCase() as CryptoNetwork;

  if (!Number.isFinite(tomanAmount) || tomanAmount <= 0 || !Number.isInteger(tomanAmount)) {
    return NextResponse.json(
      { error: "invalid_amount", message: "مبلغ تومانی معتبر وارد کنید." },
      { status: 400 }
    );
  }

  if (!allNetworks && !["BEP20", "TRC20", "TRX"].includes(network)) {
    return NextResponse.json(
      { error: "invalid_network", message: "شبکه نامعتبر است." },
      { status: 400 }
    );
  }

  const freeBalance = await getPlayerWalletFreeBalance(pgPool, user.id);
  if (tomanAmount > freeBalance) {
    return NextResponse.json(
      { error: "insufficient_funds", message: "موجودی کافی نیست." },
      { status: 400 }
    );
  }

  try {
    const rates = await getCryptoReferencePrices();

    if (allNetworks) {
      const quotes = calculateAllCryptoWithdrawQuotes({ tomanAmount, rates });
      const quotedAt = quotes.TRC20.quotedAt;
      const ratesPayload = {
        usdtTomanPrice: rates.usdtTomanPrice,
        trxUsdPrice: rates.trxUsdPrice,
        fetchedAt: rates.fetchedAt,
      };

      console.log("[Withdrawal] crypto quote batch", {
        playerId: user.id,
        requestedToman: tomanAmount,
        networks: Object.keys(quotes),
      });

      return NextResponse.json({
        ok: true,
        requestedToman: tomanAmount,
        quotedAt,
        rates: ratesPayload,
        quotes: {
          TRC20: {
            network: quotes.TRC20.network,
            cryptoSymbol: quotes.TRC20.cryptoSymbol,
            cryptoAmount: quotes.TRC20.cryptoAmount,
            lockedToman: quotes.TRC20.lockedToman,
            requestedToman: quotes.TRC20.requestedToman,
            quotedAt: quotes.TRC20.quotedAt,
          },
          BEP20: {
            network: quotes.BEP20.network,
            cryptoSymbol: quotes.BEP20.cryptoSymbol,
            cryptoAmount: quotes.BEP20.cryptoAmount,
            lockedToman: quotes.BEP20.lockedToman,
            requestedToman: quotes.BEP20.requestedToman,
            quotedAt: quotes.BEP20.quotedAt,
          },
          TRX: {
            network: quotes.TRX.network,
            cryptoSymbol: quotes.TRX.cryptoSymbol,
            cryptoAmount: quotes.TRX.cryptoAmount,
            lockedToman: quotes.TRX.lockedToman,
            requestedToman: quotes.TRX.requestedToman,
            quotedAt: quotes.TRX.quotedAt,
          },
        },
      });
    }

    const quote = calculateCryptoWithdrawQuote({
      tomanAmount,
      network,
      rates,
    });

    if (quote.lockedToman > freeBalance) {
      return NextResponse.json(
        {
          error: "insufficient_funds",
          message: "موجودی برای مبلغ بلاک‌شده پس از تبدیل کافی نیست.",
        },
        { status: 400 }
      );
    }

    console.log("[Withdrawal] crypto quote", {
      playerId: user.id,
      network,
      requestedToman: tomanAmount,
      lockedToman: quote.lockedToman,
      cryptoAmount: quote.cryptoAmount,
    });

    return NextResponse.json({
      ok: true,
      network: quote.network,
      cryptoSymbol: quote.cryptoSymbol,
      cryptoAmount: quote.cryptoAmount,
      lockedToman: quote.lockedToman,
      requestedToman: quote.requestedToman,
      quotedAt: quote.quotedAt,
      rates: {
        usdtTomanPrice: quote.rates.usdtTomanPrice,
        trxUsdPrice: quote.rates.trxUsdPrice,
        fetchedAt: quote.rates.fetchedAt,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("amount_too_small")) {
      return NextResponse.json(
        { error: "amount_too_small", message: "مبلغ برای برداشت رمز ارزی کم است." },
        { status: 422 }
      );
    }
    if (message.includes("price_feed_unavailable")) {
      return NextResponse.json(
        { error: "price_feed_unavailable", message: "دریافت نرخ ناموفق بود." },
        { status: 502 }
      );
    }
    console.error("[Withdrawal] crypto quote failed", err);
    return NextResponse.json(
      { error: "quote_failed", message: "محاسبه تبدیل ناموفق بود." },
      { status: 500 }
    );
  }
}
