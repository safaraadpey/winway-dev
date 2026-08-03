import { NextResponse } from "next/server";
import { getAdminContextOrThrow, logAdminAction } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  getKycRetryReasonLabel,
  isKycRetryReasonCode,
} from "@/lib/kyc/retryReasons";
import type { AdminKycReviewRequest } from "@/src/types/kyc";

export const runtime = "nodejs";

/**
 * POST /api/admin/kyc/review — approve or request KYC retry.
 * Idempotent: reviewing an already-finalized submission returns current state.
 */
export async function POST(request: Request) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);
    if (session.role !== "admin") {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required." },
        { status: 403 }
      );
    }

    if (!pgPool) {
      console.error("[KYC] Admin review: pgPool unavailable");
      return NextResponse.json(
        { error: "db_unavailable", message: "Database unavailable." },
        { status: 503 }
      );
    }

    let body: AdminKycReviewRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_json", message: "Invalid request body." },
        { status: 400 }
      );
    }

    const submissionId = String(body.submissionId || "").trim();
    const action = body.action;

    if (!submissionId) {
      return NextResponse.json(
        { error: "invalid_payload", message: "submissionId is required." },
        { status: 400 }
      );
    }
    if (action !== "approve" && action !== "retry") {
      return NextResponse.json(
        { error: "invalid_action", message: "action must be approve or retry." },
        { status: 400 }
      );
    }

    if (action === "retry") {
      const reasonCode = String(body.reasonCode || "");
      if (!isKycRetryReasonCode(reasonCode)) {
        return NextResponse.json(
          {
            error: "invalid_reason",
            message: "یک دلیل تکرار احراز هویت انتخاب کنید.",
          },
          { status: 400 }
        );
      }
    }

    console.log("[KYC] Admin review started", {
      adminId: session.user.id,
      submissionId,
      action,
      reasonCode: body.reasonCode ?? null,
    });

    const existing = await pgPool.query<{
      id: string;
      user_id: string;
      status: string;
    }>(
      `SELECT id, user_id, status
       FROM public.kyc_submissions
       WHERE id = $1
       LIMIT 1`,
      [submissionId]
    );

    const row = existing.rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "not_found", message: "درخواست احراز هویت یافت نشد." },
        { status: 404 }
      );
    }

    if (row.status !== "pending_review") {
      console.log("[KYC] Admin review idempotent hit", {
        submissionId,
        status: row.status,
      });
      return NextResponse.json({
        ok: true,
        status: row.status,
        message: "این درخواست قبلاً بررسی شده است.",
      });
    }

    if (action === "approve") {
      await pgPool.query(
        `UPDATE public.kyc_submissions
         SET status = 'approved',
             reviewed_at = now(),
             reviewed_by = $2,
             rejection_reason = NULL,
             rejection_reason_code = NULL,
             player_result_seen_at = NULL,
             updated_at = now()
         WHERE id = $1 AND status = 'pending_review'`,
        [submissionId, session.user.id]
      );

      await logAdminAction(
        supabase,
        session.user.id,
        "kyc_approve",
        "kyc_submissions",
        submissionId,
        { target_user_id: row.user_id },
        request
      );

      console.log("[KYC] Approved", {
        submissionId,
        userId: row.user_id,
        adminId: session.user.id,
      });

      return NextResponse.json({
        ok: true,
        status: "approved",
        message: "احراز هویت تأیید شد.",
      });
    }

    const reasonCode = body.reasonCode!;
    const reasonLabel = getKycRetryReasonLabel(reasonCode)!;

    await pgPool.query(
      `UPDATE public.kyc_submissions
       SET status = 'rejected',
           reviewed_at = now(),
           reviewed_by = $2,
           rejection_reason = $3,
           rejection_reason_code = $4,
           player_result_seen_at = NULL,
           updated_at = now()
       WHERE id = $1 AND status = 'pending_review'`,
      [submissionId, session.user.id, reasonLabel, reasonCode]
    );

    await logAdminAction(
      supabase,
      session.user.id,
      "kyc_retry",
      "kyc_submissions",
      submissionId,
      { target_user_id: row.user_id, reason_code: reasonCode },
      request
    );

    console.log("[KYC] Retry requested", {
      submissionId,
      userId: row.user_id,
      adminId: session.user.id,
      reasonCode,
    });

    return NextResponse.json({
      ok: true,
      status: "rejected",
      message: "درخواست تکرار احراز هویت ثبت شد.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required." },
        { status: 403 }
      );
    }
    console.error("[KYC] Admin review failed", err);
    return NextResponse.json(
      { error: "internal_error", message: "بررسی احراز هویت ناموفق بود." },
      { status: 500 }
    );
  }
}
