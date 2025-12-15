/**
 * API Route: واریز/برداشت دستی موجودی کیف پول
 *
 * این route برای عملیات حساس واریز/برداشت دستی استفاده می‌شود.
 * با معماری جدید مالی و ادمین هم‌راستا شده است.
 *
 * POST /api/admin/wallet/adjust
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow, logAdminAction } from "@/lib/supabaseServer";
import type {
  BulkAdjustRequest,
  TransactionAction,
} from "@/src/types/transactions";

export async function POST(request: NextRequest) {
  try {
    // 1) گرفتن context ادمین (session + service client با service_role)
    const { session, supabase } = await getAdminContextOrThrow(request);
    const adminId = session.user.id;
    const adminRole = session.adminUser?.role ?? session.role;

    console.log("[wallet/adjust] Admin user ID:", adminId, "role:", adminRole);

    // 2) خواندن body
    let body: BulkAdjustRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("[wallet/adjust] JSON parse error:", parseError);
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_json",
          message: "فرمت درخواست نامعتبر است.",
        },
        { status: 400 }
      );
    }

    const { userIds, amount, action, currency = "IRR", description } = body;
    console.log("[wallet/adjust] Request body:", {
      userIds: userIds?.length,
      amount,
      action,
      currency,
    });

    // 3) Validation
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

    // 4) اجرای عملیات مالی با هسته مالی fn_wallet_apply_delta (wrapper عمومی)
    console.log(
      "[wallet/adjust] Executing wallet adjustments for",
      userIds.length,
      "users"
    );

    const results: {
      userId: string;
      success: boolean;
      transactionId?: unknown;
      error?: string;
    }[] = [];

    for (const userId of userIds) {
      const amountDelta = action === "deposit" ? amount : -amount;

      // فراخوانی wrapper: public.fn_wallet_apply_delta
      const { data, error } = await supabase.rpc("fn_wallet_apply_delta", {
        p_user_id: userId,
        p_currency: currency,
        p_amount_delta: amountDelta,
        p_transaction_type: action as TransactionAction,
        p_source_kind: "manual_panel",
        p_source_ref: adminId, // ادمینی که این عملیات را انجام می‌دهد
        p_description:
          description ||
          `Manual ${action} by ${adminRole ?? "admin_panel"}`,
        p_meta: {},
        p_allow_negative: false,
      });

      if (error) {
        console.error(
          "[wallet/adjust] fn_wallet_apply_delta error for user",
          userId,
          ":",
          error
        );

        let errorMessage = error.message || "خطا در انجام تراکنش";
        const msgLower = errorMessage.toLowerCase();

        // نگاشت پیام‌های دیتابیس به پیام‌های فارسی قابل‌فهم
        if (
          msgLower.includes("permission denied") ||
          msgLower.includes("permission_denied")
        ) {
          errorMessage = "شما دسترسی لازم برای این عملیات را ندارید";
        } else if (
          msgLower.includes("insufficient funds") ||
          msgLower.includes("insufficient_funds")
        ) {
          errorMessage = "موجودی کافی نیست";
        } else if (
          msgLower.includes("not found") ||
          msgLower.includes("not_found")
        ) {
          errorMessage = "کاربر یا کیف پول پیدا نشد";
        } else if (msgLower.includes("zero amount")) {
          errorMessage = "مبلغ نمی‌تواند صفر باشد";
        }

        results.push({ userId, success: false, error: errorMessage });
      } else {
        console.log(
          "[wallet/adjust] Success for user",
          userId,
          "transaction ID:",
          data
        );
        results.push({ userId, success: true, transactionId: data });
      }
    }

    // 5) بررسی نتایج – اگر حتی یک خطا باشد، fail می‌کنیم
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      const firstFailure = failures[0];
      console.error("[wallet/adjust] Transaction failures:", failures.length);
      console.error("[wallet/adjust] First failure:", firstFailure);

      return NextResponse.json(
        {
          ok: false,
          error: "transaction_failed",
          message:
            firstFailure.error ||
            "خطا در انجام تراکنش برای یک یا چند کاربر.",
        },
        { status: 500 }
      );
    }

    console.log("[wallet/adjust] All transactions successful");

    // 6) ثبت در admin_audit_log (اگر خورد زمین، عملیات اصلی fail نمی‌شود)
    try {
      await logAdminAction(
        supabase,
        adminId,
        "wallet_adjust_bulk",
        "wallets",
        null, // bulk operation
        {
          userIds,
          amount,
          action,
          currency,
          description,
          transactionCount: results.length,
        },
        request
      );
      console.log("[wallet/adjust] Audit log recorded");
    } catch (auditError: any) {
      console.error("[wallet/adjust] Failed to log audit:", auditError);
    }

    // 7) پاسخ موفق
    return NextResponse.json(
      {
        ok: true,
        message: "تراکنش با موفقیت انجام شد.",
        transactionCount: results.length,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[wallet/adjust] Unexpected error:", err);

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
