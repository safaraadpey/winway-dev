/**
 * API Route: انتقال دوطرفه (اتومیک) بین wallet ها از پنل ادمین/سوپر/ایجنت
 *
 * POST /api/admin/wallet/transfer
 *
 * Security model:
 * - Single identity: the route verifies ONE Bearer token and uses the same verified token
 *   for the user-scoped RPC call (so auth.uid() in DB matches the actor).
 * - Actor id is NEVER accepted from input.
 * - Hierarchy rules are enforced inside the DB RPC.
 *
 * Notes:
 * - Only IRR is supported.
 * - Old /api/admin/wallet/adjust is untouched.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createServiceClient,
  createUserClientFromAccessToken,
  getAdminJwtContextOrThrow,
  logAdminAction,
} from "@/lib/supabaseServer";

type TransferAction = "deposit" | "withdraw";

interface BulkTransferRequest {
  userIds: string[];
  amount: number;
  action: TransferAction;
  currency?: string; // forced to IRR
  description?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1) Verify identity ONCE (JWT), and get role info (service_role read-only).
    const ctx = await getAdminJwtContextOrThrow(request);

    // 2) Parse body
    let body: BulkTransferRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid_json", message: "فرمت درخواست نامعتبر است." },
        { status: 400 }
      );
    }

    const { userIds, amount, action, currency, description } = body;

    // 3) Validation
    if (!userIds || userIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", message: "هیچ کاربری انتخاب نشده است." },
        { status: 400 }
      );
    }

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0 || !Number.isFinite(parsedAmount)) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "مبلغ باید بزرگ‌تر از صفر باشد." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(parsedAmount)) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "مبلغ باید عدد صحیح باشد." },
        { status: 400 }
      );
    }

    if (action !== "deposit" && action !== "withdraw") {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "نوع تراکنش نامعتبر است." },
        { status: 400 }
      );
    }

    if (currency && currency !== "IRR") {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "فقط IRR پشتیبانی می‌شود." },
        { status: 400 }
      );
    }

    // 4) Execute user-scoped RPC using the SAME verified JWT (single identity).
    const userClient = createUserClientFromAccessToken(ctx.accessToken);

    const results: {
      userId: string;
      success: boolean;
      transferId?: string;
      actorId?: string;
      error?: string;
    }[] = [];

    for (const userId of userIds) {
      const { data, error } = await userClient.rpc("fn_wallet_transfer_panel", {
        p_target_id: userId,
        p_amount: parsedAmount,
        p_action: action,
        p_description:
          description ||
          `Panel transfer (${action}) by ${ctx.role ?? "admin_panel"}`,
        p_meta: {},
      });

      if (error) {
        const msg = (error.message || "").toLowerCase();
        let errorMessage = error.message || "خطا در انجام انتقال";
        if (msg.includes("unauthorized")) errorMessage = "خطا در احراز هویت";
        else if (msg.includes("forbidden")) errorMessage = "شما دسترسی لازم برای این عملیات را ندارید";
        else if (msg.includes("insufficient_funds")) errorMessage = "موجودی کافی نیست";
        else if (msg.includes("target_not_found")) errorMessage = "کاربر مقصد پیدا نشد";

        results.push({ userId, success: false, error: errorMessage });
        continue;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const transferId = row?.transfer_id as string | undefined;
      const actorId = row?.actor_id as string | undefined;

      // Defensive check: DB auth.uid() must match the verified actor (single identity).
      if (!actorId || actorId !== ctx.user.id) {
        results.push({
          userId,
          success: false,
          error: "خطای امنیتی: عدم تطابق هویت اجرای RPC",
        });
        continue;
      }

      results.push({ userId, success: true, transferId, actorId });
    }

    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "transfer_failed",
          message: failures[0].error || "خطا در انجام انتقال برای یک یا چند کاربر.",
        },
        { status: 500 }
      );
    }

    // 5) Audit log (best-effort; does not affect main result)
    try {
      const serviceClient = createServiceClient();
      await logAdminAction(
        serviceClient,
        ctx.user.id,
        "wallet_transfer_bulk",
        "wallets",
        null,
        {
          userIds,
          amount: parsedAmount,
          action,
          currency: "IRR",
          transferCount: results.length,
          transferIds: results.map((r) => r.transferId).filter(Boolean),
        },
        request
      );
    } catch (auditError) {
      console.error("[wallet/transfer] Audit log failed:", auditError);
    }

    return NextResponse.json(
      {
        ok: true,
        message: "انتقال با موفقیت انجام شد.",
        transferCount: results.length,
      },
      { status: 200 }
    );
  } catch (err: any) {
    const msg = err?.message;
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "لطفاً دوباره وارد شوید." },
        { status: 401 }
      );
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی غیرمجاز." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: msg || "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}


