import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import { getOrGenerateUserAddresses } from "@/lib/deposit/cryptoAddressAllocator";
import {
  registerActiveCryptoAddresses,
  createAndStorePriceLock,
} from "@dingmoney/deposit-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["dub1", "fra1"];
export const maxDuration = 30;

/**
 * GET /api/crypto/deposit-address
 * Allocates HD addresses (source of truth). Hot Watch + price lock are best-effort
 * side effects — they must not block returning the user's dedicated addresses.
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

    // Critical path: allocate / return dedicated addresses from PostgreSQL.
    const addresses = await getOrGenerateUserAddresses(pgPool, user.id);

    // Side effects — never fail the address response if Redis/price APIs break.
    const [activeResult, priceLockResult] = await Promise.allSettled([
      registerActiveCryptoAddresses({
        userId: user.id,
        bep20Address: addresses.bep20Address,
        trc20Address: addresses.trc20Address,
      }),
      createAndStorePriceLock(pgPool, user.id),
    ]);

    let activeUntil: string | null = null;
    if (activeResult.status === "fulfilled") {
      activeUntil = activeResult.value.expiresAt ?? null;
    } else {
      console.error("[Payment] deposit-address hot-watch failed", {
        userId: user.id,
        err:
          activeResult.reason instanceof Error
            ? activeResult.reason.message
            : String(activeResult.reason),
      });
    }

    let priceLock: {
      lockedAt: string;
      expiresAt: string;
      rates: {
        usdtTomanPrice: number;
        trxUsdPrice: number;
        bnbUsdPrice: number;
      };
    } | null = null;
    if (priceLockResult.status === "fulfilled") {
      const lock = priceLockResult.value;
      priceLock = {
        lockedAt: lock.lockedAt,
        expiresAt: lock.expiresAt,
        rates: {
          usdtTomanPrice: lock.rates.usdtTomanPrice,
          trxUsdPrice: lock.rates.trxUsdPrice,
          bnbUsdPrice: lock.rates.bnbUsdPrice,
        },
      };
    } else {
      console.error("[Payment] deposit-address price-lock failed", {
        userId: user.id,
        err:
          priceLockResult.reason instanceof Error
            ? priceLockResult.reason.message
            : String(priceLockResult.reason),
      });
    }

    console.log("[Payment] deposit-address ok", {
      userId: user.id,
      derivationIndex: addresses.derivationIndex,
      hotWatch: activeResult.status,
      priceLock: priceLockResult.status,
    });

    return NextResponse.json({
      ok: true,
      data: {
        bep20Address: addresses.bep20Address,
        trc20Address: addresses.trc20Address,
        derivationIndex: addresses.derivationIndex,
        activeUntil,
        priceLock,
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
