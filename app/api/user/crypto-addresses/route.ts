import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import { getOrGenerateUserAddresses } from "@/lib/deposit/cryptoAddressAllocator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/user/crypto-addresses
 * Returns authenticated user's BEP-20 / TRC-20 deposit addresses (allocates if new).
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
    console.log("[Payment] crypto-addresses request", { userId: user.id });
    const addresses = await getOrGenerateUserAddresses(pgPool, user.id);

    return NextResponse.json({
      ok: true,
      data: {
        bep20Address: addresses.bep20Address,
        trc20Address: addresses.trc20Address,
        derivationIndex: addresses.derivationIndex,
        createdAt: addresses.createdAt,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[Payment] crypto-addresses failed", message);

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
        message: "دریافت آدرس‌های کریپتو ناموفق بود.",
      },
      { status: 500 }
    );
  }
}
