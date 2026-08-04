import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  getDepositEnvDiagnostics,
  isDepositHttpIngressAllowed,
} from "@/lib/deposit/flag";
import {
  findLatestPendingHamiPayDeposit,
  loadDepositIntentByMerchantOrderId,
  verifyAndCreditHamiPayDeposit,
} from "@/lib/deposit/hamipayFlow";
import { takeRateLimitToken } from "@/lib/deposit/rateLimit";

export const runtime = "nodejs";
export const preferredRegion = ["dub1", "fra1"];
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/player/deposit/verify
 * Body: { depositId?: string, merchantOrderId?: string, resolveLatest?: boolean }
 * Never trusts amount/status/user_id from query/body beyond local deposit id resolution.
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
  console.log("[Deposit] verify gate diagnostics", diagnostics);

  if (!isDepositHttpIngressAllowed()) {
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
    key: `deposit:verify:${user.id}`,
    limit: 20,
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

  let depositId = "";
  let merchantOrderId = "";
  let resolveLatest = false;
  try {
    const body = await request.json();
    depositId = String(body?.depositId || "").trim();
    merchantOrderId = String(body?.merchantOrderId || "").trim();
    resolveLatest = Boolean(body?.resolveLatest);
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "درخواست نامعتبر است." },
      { status: 400 }
    );
  }

  if (!depositId && merchantOrderId) {
    const byOrder = await loadDepositIntentByMerchantOrderId(
      pgPool,
      merchantOrderId
    );
    if (byOrder && byOrder.user_id === user.id) {
      depositId = byOrder.id;
      console.log("[Deposit] verify resolved merchantOrderId", {
        userId: user.id,
        depositId,
      });
    }
  }

  if (!depositId && resolveLatest) {
    const latest = await findLatestPendingHamiPayDeposit(pgPool, user.id);
    if (latest) {
      depositId = latest.id;
      console.log("[Deposit] verify resolved latest pending", {
        userId: user.id,
        depositId,
        status: latest.status,
      });
    }
  }

  if (!depositId || !UUID_RE.test(depositId)) {
    return NextResponse.json(
      { error: "invalid_deposit_id", message: "شناسه پرداخت نامعتبر است." },
      { status: 400 }
    );
  }

  console.log("[Deposit] verify API", { userId: user.id, depositId });

  const result = await verifyAndCreditHamiPayDeposit(pgPool, {
    userId: user.id,
    depositId,
  });

  return NextResponse.json({
    ok: result.ui === "credited",
    depositId: result.depositId,
    status: result.status,
    ui: result.ui,
    message: result.message,
    credited: Boolean(result.credited),
    replayed: Boolean(result.replayed),
  });
}
