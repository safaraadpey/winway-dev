import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import { cancelWithdrawalRequest } from "@/lib/withdrawal/service";
import { getWithdrawalStatusLabel } from "@/src/types/withdrawal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/player/withdrawal/cancel — player cancels a pending withdrawal request.
 */
export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "ورود لازم است." },
      { status: 401 }
    );
  }

  if (!pgPool) {
    return NextResponse.json(
      { error: "db_unavailable", message: "پایگاه‌داده در دسترس نیست." },
      { status: 503 }
    );
  }

  let body: { requestId?: string };
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

  try {
    console.log("[Withdrawal] Player cancel started", {
      playerId: user.id,
      requestId,
    });

    const result = await cancelWithdrawalRequest(pgPool, {
      requestId,
      playerId: user.id,
    });

    console.log("[Withdrawal] Player cancel completed", {
      playerId: user.id,
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
        ? "این درخواست قبلاً لغو شده بود."
        : "درخواست برداشت لغو شد و موجودی برگشت.",
    });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code || "withdrawal_failed")
        : "withdrawal_failed";
    const userMessage =
      err instanceof Error ? err.message : "لغو درخواست ناموفق بود.";

    console.error("[Withdrawal] Player cancel failed", {
      playerId: user.id,
      requestId,
      code,
      userMessage,
    });

    const status =
      code === "not_found" ? 404 : code === "forbidden" ? 403 : 400;

    return NextResponse.json({ error: code, message: userMessage }, { status });
  }
}
