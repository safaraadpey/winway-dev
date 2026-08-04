import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import { buildServerKycPayload } from "@/lib/kyc/declaration";
import type { KycQualityChecks, KycSubmitRequest } from "@/src/types/kyc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

type PendingRow = {
  id: string;
  status: string;
  kyc_code: string;
  declaration_text: string;
  created_at: string;
  rejection_reason: string | null;
  rejection_reason_code: string | null;
};

async function resolveDisplayName(userId: string): Promise<string> {
  if (!pgPool) return "کاربر";

  const profile = await pgPool.query<{ nickname: string | null }>(
    `SELECT nickname FROM public.user_profiles WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const nickname = profile.rows[0]?.nickname?.trim();
  if (nickname) return nickname;

  const user = await pgPool.query<{ username: string | null }>(
    `SELECT username FROM public.users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return user.rows[0]?.username?.trim() || "کاربر";
}

function decodeImageBase64(
  imageBase64: string,
  mimeType: string
): { buffer: Buffer; mime: string } | { error: string } {
  const raw = imageBase64.includes(",")
    ? imageBase64.split(",")[1]!
    : imageBase64;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    return { error: "invalid_image_encoding" };
  }

  if (buffer.length < 10_000) {
    return { error: "image_too_small" };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { error: "image_too_large" };
  }

  const mime = (mimeType || "image/jpeg").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return { error: "unsupported_mime_type" };
  }

  // Magic-byte sanity (non-AI structural check)
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  if (mime.includes("jpeg") || mime.includes("jpg")) {
    if (!isJpeg) return { error: "mime_mismatch" };
  } else if (mime.includes("png")) {
    if (!isPng) return { error: "mime_mismatch" };
  } else if (mime.includes("webp")) {
    if (!isWebp) return { error: "mime_mismatch" };
  }

  return { buffer, mime };
}

function validateQualityChecks(
  checks: KycQualityChecks | undefined
): string | null {
  if (!checks || typeof checks !== "object") {
    return "quality_checks_required";
  }
  if (!checks.passed) {
    return "quality_checks_failed";
  }
  if (
    typeof checks.width !== "number" ||
    typeof checks.height !== "number" ||
    checks.width < 640 ||
    checks.height < 480
  ) {
    return "resolution_too_low";
  }
  return null;
}

/**
 * GET /api/player/kyc — current KYC status + declaration payload for the wizard.
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
    console.error("[KYC] DATABASE_URL / pgPool unavailable");
    return NextResponse.json(
      { error: "db_unavailable", message: "Database unavailable." },
      { status: 503 }
    );
  }

  try {
    console.log("[KYC] Status lookup started", { userId: user.id });

    const displayName = await resolveDisplayName(user.id);
    const payload = buildServerKycPayload(user.id, displayName);

    const latest = await pgPool.query<PendingRow>(
      `SELECT id, status, kyc_code, declaration_text, created_at, rejection_reason, rejection_reason_code
       FROM public.kyc_submissions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    const row = latest.rows[0];
    if (!row) {
      return NextResponse.json({
        status: "none",
        kycCode: payload.kycCode,
        declarationText: payload.fullText,
        submittedAt: null,
        rejectionReason: null,
        rejectionReasonCode: null,
        displayName,
      });
    }

    console.log("[KYC] Status source=postgresql", {
      userId: user.id,
      status: row.status,
      submissionId: row.id,
    });

    return NextResponse.json({
      status: row.status,
      kycCode: row.kyc_code,
      declarationText:
        row.status === "pending_review" || row.status === "approved"
          ? `${row.kyc_code}\n${row.declaration_text}`
          : payload.fullText,
      submittedAt: row.created_at,
      rejectionReason: row.rejection_reason,
      rejectionReasonCode: row.rejection_reason_code,
      displayName,
    });
  } catch (err) {
    console.error("[KYC] Status lookup failed", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load KYC status." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/player/kyc — submit selfie+documents after client quality checks.
 * Idempotent on (user_id, client_request_id). One pending_review per user.
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
    console.error("[KYC] DATABASE_URL / pgPool unavailable on submit");
    return NextResponse.json(
      { error: "db_unavailable", message: "Database unavailable." },
      { status: 503 }
    );
  }

  let body: KycSubmitRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Invalid request body." },
      { status: 400 }
    );
  }

  const clientRequestId = String(body.clientRequestId || "").trim();
  if (!clientRequestId || clientRequestId.length > 80) {
    return NextResponse.json(
      { error: "invalid_client_request_id", message: "clientRequestId required." },
      { status: 400 }
    );
  }

  const qualityError = validateQualityChecks(body.qualityChecks);
  if (qualityError) {
    return NextResponse.json(
      {
        error: qualityError,
        message: "کیفیت تصویر برای ارسال قابل قبول نیست.",
        failures: body.qualityChecks?.failures ?? [],
      },
      { status: 400 }
    );
  }

  const decoded = decodeImageBase64(
    String(body.imageBase64 || ""),
    String(body.imageMimeType || "image/jpeg")
  );
  if ("error" in decoded) {
    return NextResponse.json(
      { error: decoded.error, message: "تصویر نامعتبر است." },
      { status: 400 }
    );
  }

  try {
    console.log("[KYC] Submit started", {
      userId: user.id,
      clientRequestId,
      bytes: decoded.buffer.length,
      mime: decoded.mime,
    });

    // Idempotent replay
    const existingSame = await pgPool.query<{ id: string; status: string }>(
      `SELECT id, status FROM public.kyc_submissions
       WHERE user_id = $1 AND client_request_id = $2
       LIMIT 1`,
      [user.id, clientRequestId]
    );
    if (existingSame.rows[0]) {
      console.log("[KYC] Idempotent hit", {
        userId: user.id,
        submissionId: existingSame.rows[0].id,
      });
      return NextResponse.json({
        ok: true,
        status: "pending_review",
        submissionId: existingSame.rows[0].id,
        message: "احراز هویت شما در دست بررسی قرار گرفت.",
      });
    }

    const pending = await pgPool.query<{ id: string }>(
      `SELECT id FROM public.kyc_submissions
       WHERE user_id = $1 AND status = 'pending_review'
       LIMIT 1`,
      [user.id]
    );
    if (pending.rows[0]) {
      return NextResponse.json(
        {
          error: "already_pending",
          message: "احراز هویت شما در دست بررسی است.",
          submissionId: pending.rows[0].id,
        },
        { status: 409 }
      );
    }

    const displayName = await resolveDisplayName(user.id);
    const serverPayload = buildServerKycPayload(user.id, displayName);
    const kycCode = serverPayload.kycCode;
    const declarationText = serverPayload.declarationText;

    const inserted = await pgPool.query<{ id: string }>(
      `INSERT INTO public.kyc_submissions (
         user_id,
         kyc_code,
         declaration_text,
         image_data,
         image_mime_type,
         image_byte_size,
         quality_checks,
         status,
         client_request_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7::jsonb, 'pending_review', $8
       )
       RETURNING id`,
      [
        user.id,
        kycCode,
        declarationText,
        decoded.buffer,
        decoded.mime,
        decoded.buffer.length,
        JSON.stringify(body.qualityChecks),
        clientRequestId,
      ]
    );

    const submissionId = inserted.rows[0]!.id;
    console.log("[KYC] Submit stored (unencrypted bytea)", {
      userId: user.id,
      submissionId,
      bytes: decoded.buffer.length,
      source: "postgresql",
    });

    return NextResponse.json({
      ok: true,
      status: "pending_review",
      submissionId,
      message: "احراز هویت شما در دست بررسی قرار گرفت.",
    });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";

    // Unique pending index race
    if (code === "23505") {
      console.log("[KYC] Concurrent submit conflict", { userId: user.id });
      return NextResponse.json(
        {
          error: "already_pending",
          message: "احراز هویت شما در دست بررسی است.",
        },
        { status: 409 }
      );
    }

    console.error("[KYC] Submit failed", err);
    return NextResponse.json(
      { error: "internal_error", message: "ثبت درخواست احراز هویت ناموفق بود." },
      { status: 500 }
    );
  }
}
