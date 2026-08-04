import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  getOrGenerateUserAddresses,
} from "@/lib/deposit/cryptoAddressAllocator";
import {
  tryAcquireCheckCooldown,
  scanUserAddresses,
  registerActiveCryptoAddresses,
  CRYPTO_TTL,
} from "@dingmoney/deposit-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["dub1", "fra1"];
export const maxDuration = 60;

/**
 * POST /api/crypto/check-my-deposit
 * Manual on-demand scan with 60s per-user cooldown.
 */
export async function POST(request: Request) {
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

  const acquired = await tryAcquireCheckCooldown(user.id);
  if (!acquired) {
    return NextResponse.json(
      {
        ok: false,
        error: "cooldown",
        message: `لطفاً ${CRYPTO_TTL.CHECK_COOLDOWN_SEC} ثانیه صبر کنید و دوباره تلاش کنید.`,
        retryAfterSec: CRYPTO_TTL.CHECK_COOLDOWN_SEC,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(CRYPTO_TTL.CHECK_COOLDOWN_SEC),
        },
      }
    );
  }

  try {
    const addresses = await getOrGenerateUserAddresses(pgPool, user.id);
    // Hot Watch: every check extends/starts 1h sliding window (or Confirm if PENDING).
    await registerActiveCryptoAddresses({
      userId: user.id,
      bep20Address: addresses.bep20Address,
      trc20Address: addresses.trc20Address,
    });
    const scan = await scanUserAddresses(pgPool, {
      userId: user.id,
      bep20Address: addresses.bep20Address,
      trc20Address: addresses.trc20Address,
      preferPriceLock: true,
    });

    const confirmed = scan.results.filter((r) => r.action === "confirmed");
    const pending = scan.results.filter((r) => r.action === "inserted_pending");

    return NextResponse.json({
      ok: true,
      data: {
        observed: scan.observed,
        confirmed: confirmed.map((c) => ({
          txHash: c.txHash,
          tomanAmount: c.tomanAmount,
          cryptoTxId: c.cryptoTxId,
        })),
        pending: pending.map((p) => ({
          txHash: p.txHash,
          tomanAmount: p.tomanAmount,
          cryptoTxId: p.cryptoTxId,
        })),
        results: scan.results,
        errors: scan.errors,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[Payment] check-my-deposit failed", message);
    return NextResponse.json(
      {
        ok: false,
        error: "unexpected_error",
        message: "استعلام واریز ناموفق بود.",
      },
      { status: 500 }
    );
  }
}
