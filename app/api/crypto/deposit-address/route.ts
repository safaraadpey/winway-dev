import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import { getOrGenerateUserAddresses } from "@/lib/deposit/cryptoAddressAllocator";
import { registerActiveCryptoAddresses } from "@/lib/deposit/cryptoActiveScan";
import { createAndStorePriceLock } from "@/lib/deposit/cryptoPriceLock";

export const runtime = "nodejs";
export const preferredRegion = ["dub1", "fra1"];
export const maxDuration = 30;

/**
 * GET /api/crypto/deposit-address
 * Allocates HD addresses, registers 30m active scan, locks price 20m.
 */
export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "ورود لازم است." },
      { status: 401 }
    );
  }

  if (!pgPool) {
    return NextResponse.json(
      { ok: false, error: "db_unavailable", message: "پایگاه‌داده در دسترس نیست." },
      { status: 503 }
    );
  }

  try {
    console.log("[Payment] deposit-address request", { userId: user.id });

    const addresses = await getOrGenerateUserAddresses(pgPool, user.id);

    const [active, priceLock] = await Promise.all([
      registerActiveCryptoAddresses({
        userId: user.id,
        bep20Address: addresses.bep20Address,
        trc20Address: addresses.trc20Address,
      }),
      createAndStorePriceLock(pgPool, user.id),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        bep20Address: addresses.bep20Address,
        trc20Address: addresses.trc20Address,
        derivationIndex: addresses.derivationIndex,
        activeUntil: active.expiresAt,
        priceLock: {
          lockedAt: priceLock.lockedAt,
          expiresAt: priceLock.expiresAt,
          rates: {
            usdtTomanPrice: priceLock.rates.usdtTomanPrice,
            trxUsdPrice: priceLock.rates.trxUsdPrice,
            bnbUsdPrice: priceLock.rates.bnbUsdPrice,
          },
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[Payment] deposit-address failed", message);

    if (message === "xpub_not_configured") {
      return NextResponse.json(
        {
          ok: false,
          error: "xpub_not_configured",
          message: "آدرس‌دهی کریپتو هنوز پیکربندی نشده است.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "unexpected_error",
        message: "دریافت آدرس واریز ناموفق بود.",
      },
      { status: 500 }
    );
  }
}
