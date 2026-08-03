import { NextResponse } from "next/server";
import { getAdminContextOrThrow, logAdminAction } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import type { AdminKycPurgeImageRequest } from "@/src/types/kyc";

export const runtime = "nodejs";

/**
 * POST /api/admin/kyc/purge-image
 * Clears image bytes from an approved KYC submission; history (status/user/code) remains.
 * Idempotent if image already purged.
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
      console.error("[KYC] Purge image: pgPool unavailable");
      return NextResponse.json(
        { error: "db_unavailable", message: "Database unavailable." },
        { status: 503 }
      );
    }

    let body: AdminKycPurgeImageRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_json", message: "Invalid request body." },
        { status: 400 }
      );
    }

    const submissionId = String(body.submissionId || "").trim();
    if (!submissionId) {
      return NextResponse.json(
        { error: "invalid_payload", message: "submissionId is required." },
        { status: 400 }
      );
    }

    console.log("[KYC] Purge image started", {
      adminId: session.user.id,
      submissionId,
    });

    const existing = await pgPool.query<{
      id: string;
      user_id: string;
      status: string;
      has_image: boolean;
    }>(
      `SELECT id, user_id, status, (image_data IS NOT NULL) AS has_image
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

    if (row.status !== "approved") {
      return NextResponse.json(
        {
          error: "invalid_status",
          message: "فقط تصویر احراز هویت تأییدشده قابل حذف است.",
        },
        { status: 400 }
      );
    }

    if (!row.has_image) {
      console.log("[KYC] Purge image idempotent hit", { submissionId });
      return NextResponse.json({
        ok: true,
        purged: true,
        message: "تصویر قبلاً حذف شده است.",
      });
    }

    await pgPool.query(
      `UPDATE public.kyc_submissions
       SET image_data = NULL,
           image_byte_size = 0,
           image_purged_at = now(),
           updated_at = now()
       WHERE id = $1
         AND status = 'approved'
         AND image_data IS NOT NULL`,
      [submissionId]
    );

    await logAdminAction(
      supabase,
      session.user.id,
      "kyc_purge_image",
      "kyc_submissions",
      submissionId,
      { target_user_id: row.user_id },
      request
    );

    console.log("[KYC] Image purged; history kept", {
      submissionId,
      userId: row.user_id,
      adminId: session.user.id,
    });

    return NextResponse.json({
      ok: true,
      purged: true,
      message: "تصویر حذف شد. سابقه احراز هویت باقی ماند.",
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
    console.error("[KYC] Purge image failed", err);
    return NextResponse.json(
      { error: "internal_error", message: "حذف تصویر ناموفق بود." },
      { status: 500 }
    );
  }
}
