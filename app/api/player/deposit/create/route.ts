import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  getDepositEnvDiagnostics,
  isDepositHttpIngressAllowed,
} from "@/lib/deposit/flag";
import {
  createHamiPayDepositIntent,
  resumeHamiPayPaymentUrl,
} from "@/lib/deposit/hamipayFlow";
import {
  resolveDepositCustomerName,
  resolveDepositCustomerPhone,
} from "@/lib/deposit/customerProfile";
import { validateDepositAmountToman } from "@/lib/deposit/limits";
import { takeRateLimitToken } from "@/lib/deposit/rateLimit";
import { rialsToTomans } from "@/lib/format/persianAmountWords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Prefer regions closer to Iran / Arvan CDN (hppaya) — Vercel US often times out (~15s → 504). */
export const preferredRegion = ["dub1", "fra1"];
export const maxDuration = 60;

/**
 * POST /api/player/deposit/create
 * Body: { amountRial | amountToman, depositId? }
 * Never accepts user_id from client.
 * customerPhone is server-assigned (synthetic MCI/Irancell) — not from the player.
 */
export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "ورود لازم است." },
      { status: 401 }
    );
  }

  const diagnostics = getDepositEnvDiagnostics();
  console.log("[Deposit] create gate diagnostics", diagnostics);

  if (!isDepositHttpIngressAllowed()) {
    console.error("[Deposit] create blocked by feature gate", {
      reason: diagnostics.createAllowReason,
      depositDomainEnabled: diagnostics.depositDomainEnabled,
      hamipayMock: diagnostics.hamipayMock,
      hasHamiPayApiKey: diagnostics.hasHamiPayApiKey,
      hasHamiPayApiBaseUrl: diagnostics.hasHamiPayApiBaseUrl,
      detectedDeploymentEnvironment: diagnostics.detectedDeploymentEnvironment,
    });
    return NextResponse.json(
      {
        error: "deposit_disabled",
        message: "درگاه پرداخت فعلاً فعال نیست.",
        reason: diagnostics.createAllowReason,
      },
      { status: 503 }
    );
  }

  if (!pgPool) {
    return NextResponse.json(
      { error: "db_unavailable", message: "پایگاه‌داده در دسترس نیست." },
      { status: 503 }
    );
  }

  const rate = takeRateLimitToken({
    key: `deposit:create:${user.id}`,
    limit: 8,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      }
    );
  }

  let body: {
    amountRial?: number;
    amountToman?: number;
    depositId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "درخواست نامعتبر است." },
      { status: 400 }
    );
  }

  // Resume existing payment (idempotent redirect)
  if (body.depositId) {
    const resumed = await resumeHamiPayPaymentUrl(pgPool, {
      userId: user.id,
      depositId: String(body.depositId),
    });
    if (resumed) {
      return NextResponse.json({
        ok: true,
        depositId: resumed.depositId,
        paymentUrl: resumed.paymentUrl,
        resumed: true,
      });
    }
  }

  // BuyRial input is Rials; wallet SoR + limits use toman (1 toman = 10 rials).
  // HamiPay/SEP receives Rials again via tomanToProviderAmount (default unit=rial).
  let amountToman = 0;
  let amountRialFromClient: number | null = null;
  if (typeof body.amountToman === "number") {
    amountToman = Math.floor(body.amountToman);
  } else if (typeof body.amountRial === "number") {
    amountRialFromClient = Math.floor(body.amountRial);
    amountToman = rialsToTomans(amountRialFromClient);
  }

  const validated = validateDepositAmountToman(amountToman);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.code, message: validated.message },
      { status: 400 }
    );
  }

  // Load customer profile for HamiPay metadata (non-authoritative for wallet)
  let username: string | null = null;
  let email: string | null = null;
  let nickname: string | null = null;
  let assignedPhone: string | null = null;
  try {
    const profile = await pgPool.query<{
      username: string | null;
      email: string | null;
      nickname: string | null;
      assigned_phone: string | null;
    }>(
      `SELECT
         u.username,
         u.email,
         p.nickname,
         coalesce(
           nullif(p.metadata->>'hamipay_phone', ''),
           nullif(p.metadata->>'phone', '')
         ) AS assigned_phone
       FROM public.users u
       LEFT JOIN public.user_profiles p ON p.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [user.id]
    );
    username = profile.rows[0]?.username ?? null;
    email = profile.rows[0]?.email ?? null;
    nickname = profile.rows[0]?.nickname ?? null;
    assignedPhone = profile.rows[0]?.assigned_phone ?? null;
  } catch (err) {
    console.error("[Deposit] create profile lookup failed", {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const resolvedName = resolveDepositCustomerName({
    nickname,
    username,
    email,
  });
  const resolvedPhone = resolveDepositCustomerPhone({
    userId: user.id,
    assignedPhone,
  });

  // Persist assigned phone once so the same user always reuses it
  if (resolvedPhone.source === "generated") {
    try {
      await pgPool.query(
        `INSERT INTO public.user_profiles (user_id, metadata, created_at, updated_at)
         VALUES ($1, jsonb_build_object('hamipay_phone', $2::text), now(), now())
         ON CONFLICT (user_id) DO UPDATE
         SET metadata = coalesce(user_profiles.metadata, '{}'::jsonb)
                        || jsonb_build_object('hamipay_phone', $2::text),
             updated_at = now()`,
        [user.id, resolvedPhone.phone]
      );
    } catch (err) {
      console.error("[Deposit] persist assigned phone failed", {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    console.log("[Deposit] create API → HamiPay adapter", {
      userId: user.id,
      amountRial:
        amountRialFromClient ?? validated.amount * 10,
      amountToman: validated.amount,
      customerNameSource: resolvedName.source,
      customerPhoneSource: resolvedPhone.source,
      allowReason: diagnostics.createAllowReason,
      hasHamiPayApiKey: diagnostics.hasHamiPayApiKey,
      hasHamiPayApiBaseUrl: diagnostics.hasHamiPayApiBaseUrl,
      hamipayMock: diagnostics.hamipayMock,
    });

    const result = await createHamiPayDepositIntent(pgPool, {
      userId: user.id,
      amountToman: validated.amount,
      customerName: resolvedName.name,
      customerPhone: resolvedPhone.phone,
      username,
      email,
    });

    return NextResponse.json({
      ok: true,
      depositId: result.depositId,
      paymentUrl: result.paymentUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Provider validation detail is logged server-side only (browser stays generic).
    console.error("[Deposit] create API failed", {
      userId: user.id,
      error: message,
    });
    return NextResponse.json(
      {
        error: "failed_to_create",
        message:
          "اتصال به درگاه پرداخت ناموفق بود. لطفاً دوباره تلاش کنید.",
        retryable: true,
      },
      { status: 502 }
    );
  }
}
