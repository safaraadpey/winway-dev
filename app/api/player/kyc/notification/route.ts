import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import { getKycRetryReasonLabel } from "@/lib/kyc/retryReasons";
import type { KycNotificationResponse } from "@/src/types/kyc";

export const runtime = "nodejs";

/**
 * GET /api/player/kyc/notification — unseen approve/retry result for entry popup.
 */
export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Authentication required." },
      { status: 401 }
    );
  }

  if (!pgPool) {
    return NextResponse.json(
      { error: "db_unavailable", message: "Database unavailable." },
      { status: 503 }
    );
  }

  try {
    const result = await pgPool.query<{
      id: string;
      status: string;
      rejection_reason_code: string | null;
    }>(
      `SELECT id, status, rejection_reason_code
       FROM public.kyc_submissions
       WHERE user_id = $1
         AND status IN ('approved', 'rejected')
         AND player_result_seen_at IS NULL
       ORDER BY reviewed_at DESC NULLS LAST, updated_at DESC
       LIMIT 1`,
      [user.id]
    );

    const row = result.rows[0];
    if (!row) {
      const empty: KycNotificationResponse = {
        hasNotification: false,
        submissionId: null,
        kind: null,
        rejectionReasonCode: null,
        rejectionReasonLabel: null,
      };
      return NextResponse.json(empty);
    }

    console.log("[KYC] Player notification", {
      userId: user.id,
      submissionId: row.id,
      status: row.status,
    });

    const payload: KycNotificationResponse = {
      hasNotification: true,
      submissionId: row.id,
      kind: row.status === "approved" ? "approved" : "rejected",
      rejectionReasonCode: row.rejection_reason_code,
      rejectionReasonLabel: getKycRetryReasonLabel(row.rejection_reason_code),
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[KYC] Player notification failed", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load KYC notification." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/player/kyc/notification — acknowledge entry popup (idempotent).
 * Body: { submissionId: string }
 */
export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Authentication required." },
      { status: 401 }
    );
  }

  if (!pgPool) {
    return NextResponse.json(
      { error: "db_unavailable", message: "Database unavailable." },
      { status: 503 }
    );
  }

  let submissionId = "";
  try {
    const body = await request.json();
    submissionId = String(body?.submissionId || "").trim();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!submissionId) {
    return NextResponse.json(
      { error: "invalid_payload", message: "submissionId is required." },
      { status: 400 }
    );
  }

  try {
    const updated = await pgPool.query<{ id: string }>(
      `UPDATE public.kyc_submissions
       SET player_result_seen_at = COALESCE(player_result_seen_at, now()),
           updated_at = now()
       WHERE id = $1
         AND user_id = $2
         AND status IN ('approved', 'rejected')
       RETURNING id`,
      [submissionId, user.id]
    );

    if (!updated.rows[0]) {
      return NextResponse.json(
        { error: "not_found", message: "Notification not found." },
        { status: 404 }
      );
    }

    console.log("[KYC] Player notification acknowledged", {
      userId: user.id,
      submissionId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[KYC] Player notification ack failed", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to acknowledge notification." },
      { status: 500 }
    );
  }
}
