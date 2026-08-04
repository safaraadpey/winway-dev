import { NextResponse } from "next/server";
import { pgPool } from "@/lib/pg";
import { calculateCryptoInvoice } from "@/lib/deposit/cryptoInvoice";
import { takeRateLimitToken } from "@/lib/deposit/rateLimit";

export const runtime = "nodejs";
export const preferredRegion = ["dub1", "fra1"];
export const maxDuration = 30;

/**
 * POST /api/deposit/calculate-invoice
 * Body: { usdAmount: number }
 * Live quote for BEP20 / TRC20 / TRX — no wallet mutation.
 */
export async function POST(request: Request) {
  if (!pgPool) {
    return NextResponse.json(
      { ok: false, error: "db_unavailable", message: "پایگاه‌داده در دسترس نیست." },
      { status: 503 }
    );
  }

  let body: { usdAmount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "بدنه درخواست نامعتبر است." },
      { status: 400 }
    );
  }

  const usdAmount = Number(body?.usdAmount);
  if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_usd_amount",
        message: "مبلغ دلاری معتبر وارد کنید.",
      },
      { status: 400 }
    );
  }

  if (usdAmount > 1_000_000) {
    return NextResponse.json(
      {
        ok: false,
        error: "amount_too_large",
        message: "مبلغ بیش از حد مجاز است.",
      },
      { status: 400 }
    );
  }

  const rate = takeRateLimitToken({
    key: `deposit:invoice:${request.headers.get("x-forwarded-for") ?? "anon"}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        message: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      }
    );
  }

  try {
    console.log("[Payment] calculate-invoice request", { usdAmount });
    const quote = await calculateCryptoInvoice(pgPool, usdAmount);
    return NextResponse.json({ ok: true, ...quote });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[Payment] calculate-invoice failed", message);

    if (message.startsWith("no_tier_for_")) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_tier",
          message:
            "برای این مبلغ بازهٔ ضریب ادمین تعریف نشده است. با پشتیبانی تماس بگیرید.",
        },
        { status: 422 }
      );
    }

    if (
      message.includes("abort") ||
      message.startsWith("http_") ||
      message.startsWith("invalid_usdt") ||
      message.startsWith("invalid_trx")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "price_feed_unavailable",
          message:
            "دریافت قیمت زنده ناموفق بود. لطفاً چند لحظه بعد دوباره تلاش کنید.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "unexpected_error",
        message: "محاسبه فاکتور ناموفق بود.",
      },
      { status: 500 }
    );
  }
}
