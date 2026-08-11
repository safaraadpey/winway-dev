import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import {
  createWithdrawalRequest,
  getPlayerWalletFreeBalance,
} from "@/lib/withdrawal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/player/withdrawal/create
 * Body: { amount, cardNumber, shebaNumber, fullName, clientRequestId }
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

  let body: {
    amount?: number;
    cardNumber?: string;
    shebaNumber?: string;
    fullName?: string;
    clientRequestId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "درخواست نامعتبر است." },
      { status: 400 }
    );
  }

  const amount = Number(body.amount);
  const cardNumber = String(body.cardNumber || "").trim();
  const shebaNumber = String(body.shebaNumber || "").trim();
  const fullName = String(body.fullName || "").trim();
  const clientRequestId = String(body.clientRequestId || "").trim();

  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return NextResponse.json(
      {
        error: "invalid_amount",
        message: "مبلغ باید عدد صحیح بزرگ‌تر از صفر باشد.",
      },
      { status: 400 }
    );
  }

  if (!clientRequestId) {
    return NextResponse.json(
      { error: "client_request_id_required", message: "شناسه درخواست الزامی است." },
      { status: 400 }
    );
  }

  const freeBalance = await getPlayerWalletFreeBalance(pgPool, user.id);
  if (amount > freeBalance) {
    return NextResponse.json(
      { error: "insufficient_funds", message: "مبلغ بیشتر از موجودی قابل برداشت است." },
      { status: 400 }
    );
  }

  console.log("[Withdrawal] Create started", {
    playerId: user.id,
    amount,
    clientRequestId,
  });

  try {
    const created = await createWithdrawalRequest(pgPool, {
      playerId: user.id,
      amount,
      cardNumber,
      shebaNumber,
      fullName,
      clientRequestId,
    });

    console.log("[Withdrawal] Create completed", {
      playerId: user.id,
      requestId: created.requestId,
      status: created.status,
      replayed: created.replayed,
    });

    return NextResponse.json({
      ok: true,
      requestId: created.requestId,
      status: created.status,
      statusLabel: "در حال بررسی",
      replayed: created.replayed,
    });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code || "withdrawal_failed")
        : "withdrawal_failed";
    const message =
      err instanceof Error ? err.message : "ثبت درخواست برداشت ناموفق بود.";
    console.error("[Withdrawal] Create failed", { playerId: user.id, code, message });
    return NextResponse.json({ error: code, message }, { status: 400 });
  }
}
