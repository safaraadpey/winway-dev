import { NextResponse } from "next/server";
import {
  createServiceClient,
  getAdminJwtContextOrThrow,
  logAdminAction,
} from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  getWithdrawalRequestKind,
  markWithdrawalProcessing,
} from "@/lib/withdrawal/service";
import type {
  AdminWithdrawalMarkProcessingBody,
  WithdrawalKind,
} from "@/src/types/withdrawal";
import { getWithdrawalStatusLabel } from "@/src/types/withdrawal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/withdrawal/mark-processing
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAdminJwtContextOrThrow(request);
    const role = ctx.role;

    if (!["admin", "agent"].includes(role)) {
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

    let body: AdminWithdrawalMarkProcessingBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_json", message: "درخواست نامعتبر است." },
        { status: 400 }
      );
    }

    const requestId = String(body.requestId || "").trim();
    if (!requestId) {
      return NextResponse.json(
        { error: "invalid_payload", message: "شناسه درخواست الزامی است." },
        { status: 400 }
      );
    }

    const kind: WithdrawalKind =
      body.kind ??
      (await getWithdrawalRequestKind(pgPool, requestId)) ??
      "rial";

    if (kind === "crypto" && role !== "admin") {
      return NextResponse.json(
        { error: "forbidden", message: "فقط ادمین می‌تواند برداشت رمز ارزی را مدیریت کند." },
        { status: 403 }
      );
    }

    if (kind === "rial" && role !== "agent") {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "فقط ایجنت بالادستی پلیر می‌تواند برداشت ریالی را مدیریت کند.",
        },
        { status: 403 }
      );
    }

    console.log("[Withdrawal] Mark processing started", {
      actorId: ctx.user.id,
      role,
      requestId,
      kind,
    });

    const result = await markWithdrawalProcessing(pgPool, {
      requestId,
      actorId: ctx.user.id,
    });

    const serviceClient = createServiceClient();
    await logAdminAction(
      serviceClient,
      ctx.user.id,
      kind === "crypto" ? "withdrawal_crypto_processing" : "withdrawal_processing",
      "withdrawal_requests",
      requestId,
      { kind, replayed: result.replayed },
      request
    );

    console.log("[Withdrawal] Mark processing completed", {
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
      message: result.replayed
        ? "این درخواست قبلاً در حال پرداخت بود."
        : "وضعیت به «در حال پرداخت» تغییر کرد.",
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
      err instanceof Error ? err.message : "تغییر وضعیت ناموفق بود.";

    console.error("[Withdrawal] Mark processing failed", { code, userMessage });

    const status =
      code === "not_found" ? 404 : code === "forbidden" ? 403 : 400;

    return NextResponse.json({ error: code, message: userMessage }, { status });
  }
}
