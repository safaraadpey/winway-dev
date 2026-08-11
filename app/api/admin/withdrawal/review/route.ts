import { NextResponse } from "next/server";
import {
  createServiceClient,
  getAdminJwtContextOrThrow,
  logAdminAction,
} from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  getWithdrawalRequestKind,
  reviewWithdrawalRequest,
} from "@/lib/withdrawal/service";
import type { AdminWithdrawalReviewBody, WithdrawalKind } from "@/src/types/withdrawal";
import { getWithdrawalStatusLabel } from "@/src/types/withdrawal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/withdrawal/review — approve or reject a pending withdrawal request.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAdminJwtContextOrThrow(request);
    const role = ctx.role;

    if (!["admin", "super", "agent"].includes(role)) {
      return NextResponse.json(
        { error: "forbidden", message: "دسترسی مجاز نیست." },
        { status: 403 }
      );
    }

    if (!pgPool) {
      return NextResponse.json(
        { error: "db_unavailable", message: "پایگاه‌داده در دسترس نیست." },
        { status: 503 }
      );
    }

    let body: AdminWithdrawalReviewBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_json", message: "درخواست نامعتبر است." },
        { status: 400 }
      );
    }

    const requestId = String(body.requestId || "").trim();
    const action = body.action;
    const kindHint = body.kind;

    if (!requestId) {
      return NextResponse.json(
        { error: "invalid_payload", message: "شناسه درخواست الزامی است." },
        { status: 400 }
      );
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "invalid_action", message: "عملیات باید approve یا reject باشد." },
        { status: 400 }
      );
    }

    const reason = String(body.reason || "").trim();
    if (!reason) {
      return NextResponse.json(
        { error: "review_note_required", message: "توضیحات بررسی الزامی است." },
        { status: 400 }
      );
    }

    const kind: WithdrawalKind =
      kindHint ??
      (await getWithdrawalRequestKind(pgPool, requestId)) ??
      "rial";

    if (kind === "crypto" && role !== "admin") {
      return NextResponse.json(
        { error: "forbidden", message: "فقط ادمین می‌تواند برداشت رمز ارزی را بررسی کند." },
        { status: 403 }
      );
    }

    if (kind === "rial" && role !== "agent") {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "فقط ایجنت بالادستی پلیر می‌تواند برداشت ریالی را بررسی کند.",
        },
        { status: 403 }
      );
    }

    console.log("[Withdrawal] Review started", {
      actorId: ctx.user.id,
      role,
      requestId,
      action,
      kind,
    });

    const result = await reviewWithdrawalRequest(pgPool, {
      requestId,
      actorId: ctx.user.id,
      action,
      reason,
      kind,
    });

    const serviceClient = createServiceClient();
    const logAction =
      kind === "crypto"
        ? action === "approve"
          ? "withdrawal_crypto_approve"
          : "withdrawal_crypto_reject"
        : action === "approve"
          ? "withdrawal_approve"
          : "withdrawal_reject";

    await logAdminAction(
      serviceClient,
      ctx.user.id,
      logAction,
      "withdrawal_requests",
      requestId,
      { action, kind, reason, replayed: result.replayed },
      request
    );

    console.log("[Withdrawal] Review completed", {
      actorId: ctx.user.id,
      requestId: result.requestId,
      status: result.status,
      replayed: result.replayed,
    });

    return NextResponse.json({
      ok: true,
      requestId: result.requestId,
      status: result.status,
      statusLabel: getWithdrawalStatusLabel(result.status),
      replayed: result.replayed,
      message:
        action === "approve"
          ? result.replayed
            ? "این درخواست قبلاً تأیید شده بود."
            : kind === "crypto"
              ? "برداشت رمز ارزی تأیید شد."
              : "برداشت تأیید شد."
          : result.replayed
            ? "این درخواست قبلاً رد شده بود."
            : kind === "crypto"
              ? "درخواست رمز ارزی رد شد و موجودی برگشت."
              : "درخواست برداشت رد شد و موجودی به کاربر برگشت.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "unauthorized", message: "ورود لازم است." },
        { status: 401 }
      );
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "forbidden", message: "دسترسی مجاز نیست." },
        { status: 403 }
      );
    }

    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code || "withdrawal_failed")
        : "withdrawal_failed";
    const userMessage =
      err instanceof Error ? err.message : "بررسی درخواست ناموفق بود.";

    console.error("[Withdrawal] Review failed", { code, userMessage });

    const status =
      code === "not_found" ? 404 : code === "forbidden" ? 403 : 400;

    return NextResponse.json({ error: code, message: userMessage }, { status });
  }
}
