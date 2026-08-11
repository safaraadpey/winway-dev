import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  getDepositEnvDiagnostics,
  isDepositHttpIngressAllowed,
  isDepositSyntheticCustomerIdentityEnabled,
} from "@/lib/deposit/flag";
import {
  createHamiPayDepositIntent,
  resumeHamiPayPaymentUrl,
} from "@/lib/deposit/hamipayFlow";
import { resolveDepositCustomerIdentity } from "@/lib/deposit/customerProfile";
import { generateStableSyntheticCustomerIdentity } from "@/lib/deposit/syntheticCustomerIdentity";
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
 * Body: { amountRial | amountToman, fullName?, phone?, depositId? }
 * Never accepts user_id from client.
 * full_name/phone: first write from client, then locked in user_profiles.
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
    fullName?: string;
    phone?: string;
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

  // Load deposit identity (first-write locked columns)
  let username: string | null = null;
  let email: string | null = null;
  let storedFullName: string | null = null;
  let storedPhone: string | null = null;
  try {
    const profile = await pgPool.query<{
      username: string | null;
      email: string | null;
      full_name: string | null;
      phone: string | null;
    }>(
      `SELECT
         u.username,
         u.email,
         p.full_name,
         p.phone
       FROM public.users u
       LEFT JOIN public.user_profiles p ON p.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [user.id]
    );
    username = profile.rows[0]?.username ?? null;
    email = profile.rows[0]?.email ?? null;
    storedFullName = profile.rows[0]?.full_name ?? null;
    storedPhone = profile.rows[0]?.phone ?? null;
  } catch (err) {
    console.error("[Deposit] create profile lookup failed", {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const resolved = resolveDepositCustomerIdentity({
    userId: user.id,
    syntheticEnabled: isDepositSyntheticCustomerIdentityEnabled(),
    storedFullName,
    storedPhone,
    clientFullName:
      typeof body.fullName === "string" ? body.fullName : null,
    clientPhone: typeof body.phone === "string" ? body.phone : null,
    generateSynthetic: generateStableSyntheticCustomerIdentity,
  });

  if (!resolved.name) {
    console.warn("[Deposit] create missing customer name", {
      userId: user.id,
      identityMode: resolved.identityMode,
      syntheticEnabled: isDepositSyntheticCustomerIdentityEnabled(),
      hasClientFullName: typeof body.fullName === "string" && body.fullName.trim().length > 0,
      hasStoredFullName: Boolean(storedFullName),
    });
    return NextResponse.json(
      {
        error: "full_name_required",
        message: "نام و نام خانوادگی را وارد کنید.",
      },
      { status: 400 }
    );
  }
  if (!resolved.phone) {
    return NextResponse.json(
      {
        error: "phone_required",
        message: "شماره موبایل معتبر وارد کنید (مثال: 09123456789).",
      },
      { status: 400 }
    );
  }

  if (resolved.needsPersist) {
    try {
      await pgPool.query(
        `INSERT INTO public.user_profiles (user_id, full_name, phone, created_at, updated_at)
         VALUES ($1, $2, $3, now(), now())
         ON CONFLICT (user_id) DO UPDATE
         SET full_name = COALESCE(user_profiles.full_name, EXCLUDED.full_name),
             phone = COALESCE(user_profiles.phone, EXCLUDED.phone),
             updated_at = now()`,
        [user.id, resolved.name, resolved.phone]
      );
      console.log("[Deposit] deposit identity persisted", {
        userId: user.id,
        identityMode: resolved.identityMode,
        nameSource: resolved.nameSource,
        phoneSource: resolved.phoneSource,
      });
    } catch (err) {
      console.error("[Deposit] persist deposit identity failed", {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        {
          error: "identity_persist_failed",
          message: "ثبت مشخصات برای درگاه ناموفق بود. دوباره تلاش کنید.",
        },
        { status: 500 }
      );
    }
  }

  try {
    console.log("[Deposit] create API → HamiPay adapter", {
      userId: user.id,
      amountRial:
        amountRialFromClient ?? validated.amount * 10,
      amountToman: validated.amount,
      identityMode: resolved.identityMode,
      customerNameSource: resolved.nameSource,
      customerPhoneSource: resolved.phoneSource,
      allowReason: diagnostics.createAllowReason,
      hasHamiPayApiKey: diagnostics.hasHamiPayApiKey,
      hasHamiPayApiBaseUrl: diagnostics.hasHamiPayApiBaseUrl,
      hamipayMock: diagnostics.hamipayMock,
      depositSyntheticCustomerIdentity:
        diagnostics.depositSyntheticCustomerIdentity,
    });

    const result = await createHamiPayDepositIntent(pgPool, {
      userId: user.id,
      amountToman: validated.amount,
      customerName: resolved.name,
      customerPhone: resolved.phone,
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
    const isReturnUrlMismatch = message.startsWith(
      "hamipay_return_url_mismatch:"
    );
    return NextResponse.json(
      {
        error: isReturnUrlMismatch
          ? "hamipay_return_url_mismatch"
          : "failed_to_create",
        message: isReturnUrlMismatch
          ? "آدرس بازگشت درگاه با دامنه ثبت‌شده در HamiPay مطابقت ندارد. دامنه در پنل HamiPay باید به dingmoney.org به‌روز شود."
          : "اتصال به درگاه پرداخت ناموفق بود. لطفاً دوباره تلاش کنید.",
        retryable: !isReturnUrlMismatch,
      },
      { status: 502 }
    );
  }
}
