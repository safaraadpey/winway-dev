/**
 * API Route: manual wallet deposit/withdraw via fn_wallet_apply_delta
 *
 * POST /api/admin/wallet/adjust
 *
 * P6.4 Strategy B — per-item TX + mandatory idempotencyKey + structured results.
 * Does NOT implement Deposit Domain (manual_panel remains treasury injection path).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow, logAdminAction } from "@/lib/supabaseServer";
import type {
  BulkAdjustRequest,
  TransactionAction,
} from "@/src/types/transactions";
import { financeMetricInc } from "@/lib/finance/metrics";

type ItemResult = {
  userId: string;
  idempotencyKey: string;
  success: boolean;
  transactionId?: unknown;
  replayed?: boolean;
  error?: string;
  code?: string;
};

function mapAdjustError(message: string): { error: string; code: string } {
  const msgLower = (message || "").toLowerCase();
  if (
    msgLower.includes("permission denied") ||
    msgLower.includes("permission_denied")
  ) {
    return {
      error: "شما دسترسی لازم برای این عملیات را ندارید",
      code: "permission_denied",
    };
  }
  if (
    msgLower.includes("insufficient funds") ||
    msgLower.includes("insufficient_funds")
  ) {
    return { error: "موجودی کافی نیست", code: "insufficient_funds" };
  }
  if (msgLower.includes("not found") || msgLower.includes("not_found")) {
    return { error: "کاربر یا کیف پول پیدا نشد", code: "not_found" };
  }
  if (msgLower.includes("zero amount")) {
    return { error: "مبلغ نمی‌تواند صفر باشد", code: "zero_amount" };
  }
  if (msgLower.includes("idempotency_payload_mismatch")) {
    return {
      error: "کلید یکتایی با مبلغ/کاربر/نوع متفاوت قبلاً ثبت شده است",
      code: "idempotency_payload_mismatch",
    };
  }
  return {
    error: message || "خطا در انجام تراکنش",
    code: "transaction_failed",
  };
}

export async function POST(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);
    const adminId = session.user.id;
    const adminRole = session.adminUser?.role ?? session.role;

    console.log("[Wallet] adjust start", { adminId, role: adminRole });

    let body: BulkAdjustRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("[Wallet] adjust JSON parse error:", parseError);
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_json",
          message: "فرمت درخواست نامعتبر است.",
        },
        { status: 400 }
      );
    }

    const {
      userIds,
      idempotencyKeys,
      amount,
      action,
      currency = "IRR",
      description,
    } = body;

    if (!userIds || userIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_payload",
          message: "هیچ کاربری انتخاب نشده است.",
        },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(idempotencyKeys) ||
      idempotencyKeys.length !== userIds.length
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_payload",
          message:
            "برای هر کاربر باید یک idempotencyKey ارسال شود (طول آرایه برابر userIds).",
        },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    for (const key of idempotencyKeys) {
      const trimmed = String(key || "").trim();
      if (!trimmed) {
        return NextResponse.json(
          {
            ok: false,
            error: "invalid_payload",
            message: "idempotencyKey خالی مجاز نیست.",
          },
          { status: 400 }
        );
      }
      if (seen.has(trimmed)) {
        return NextResponse.json(
          {
            ok: false,
            error: "invalid_payload",
            message: "idempotencyKey تکراری در یک درخواست مجاز نیست.",
          },
          { status: 400 }
        );
      }
      seen.add(trimmed);
    }

    if (!amount || amount <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "مبلغ باید بزرگ‌تر از صفر باشد.",
        },
        { status: 400 }
      );
    }

    if (action !== "deposit" && action !== "withdraw") {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "نوع تراکنش نامعتبر است.",
        },
        { status: 400 }
      );
    }

    const results: ItemResult[] = [];

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const idempotencyKey = String(idempotencyKeys[i]).trim();
      const amountDelta = action === "deposit" ? amount : -amount;

      const { data: existingTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      const { data, error } = await supabase.rpc("fn_wallet_apply_delta", {
        p_user_id: userId,
        p_currency: currency,
        p_amount_delta: amountDelta,
        p_transaction_type: action as TransactionAction,
        p_source_kind: "manual_panel",
        p_source_ref: adminId,
        p_description:
          description ||
          `Manual ${action} by ${adminRole ?? "admin_panel"}`,
        p_meta: {},
        p_allow_negative: false,
        p_idempotency_key: idempotencyKey,
      });

      if (error) {
        const mapped = mapAdjustError(error.message || "");
        if (mapped.code === "idempotency_payload_mismatch") {
          financeMetricInc("duplicate_apply_delta_attempts");
        }
        console.error("[Wallet] adjust item failed", {
          userId,
          idempotencyKey,
          message: error.message,
        });
        results.push({
          userId,
          idempotencyKey,
          success: false,
          error: mapped.error,
          code: mapped.code,
        });
        continue;
      }

      const replayed = Boolean(
        existingTx?.id && String(existingTx.id) === String(data)
      );
      if (replayed) {
        financeMetricInc("duplicate_apply_delta_attempts");
      }

      console.log("[Wallet] adjust item ok", {
        userId,
        transactionId: data,
        replayed,
      });
      results.push({
        userId,
        idempotencyKey,
        success: true,
        transactionId: data,
        replayed,
      });
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;
    const partial = successCount > 0 && failureCount > 0;

    if (partial) {
      financeMetricInc("partial_bulk_failure");
    }

    try {
      await logAdminAction(
        supabase,
        adminId,
        "wallet_adjust_bulk",
        "wallets",
        null,
        {
          userIds,
          idempotencyKeys,
          amount,
          action,
          currency,
          description,
          successCount,
          failureCount,
          partial,
        },
        request
      );
    } catch (auditError: any) {
      console.error("[Wallet] adjust audit failed:", auditError);
    }

    const payload = {
      ok: failureCount === 0,
      partial,
      successCount,
      failureCount,
      results,
      message:
        failureCount === 0
          ? "تراکنش با موفقیت انجام شد."
          : partial
            ? "برخی تراکنش‌ها موفق و برخی ناموفق بودند. نتایج را بررسی کنید."
            : results.find((r) => !r.success)?.error ||
              "خطا در انجام تراکنش.",
    };

    const status = failureCount === 0 ? 200 : partial ? 207 : 500;
    return NextResponse.json(payload, { status });
  } catch (err: any) {
    console.error("[Wallet] adjust unexpected:", err);

    let errorMessage = "خطای غیرمنتظره در انجام تراکنش";
    if (err?.message) {
      errorMessage = err.message;
    } else if (typeof err === "string") {
      errorMessage = err;
    } else if (err?.toString) {
      errorMessage = err.toString();
    }

    return NextResponse.json(
      {
        ok: false,
        error: "unexpected_error",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
