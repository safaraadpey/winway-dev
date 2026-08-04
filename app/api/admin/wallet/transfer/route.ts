/**
 * API Route: atomic two-sided wallet transfer (panel)
 *
 * POST /api/admin/wallet/transfer
 *
 * P6.4 Strategy B — per-item transaction + mandatory clientRequestId + structured results.
 * Each item is its own DB transaction (RPC). Replay returns previous success; payload mismatch rejects.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createServiceClient,
  createUserClientFromAccessToken,
  getAdminJwtContextOrThrow,
  logAdminAction,
} from "@/lib/supabaseServer";
import { financeMetricInc } from "@/lib/finance/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TransferAction = "deposit" | "withdraw";

interface BulkTransferRequest {
  userIds: string[];
  /** Required: one idempotency id per userId (same length / parallel array). */
  clientRequestIds: string[];
  amount: number;
  action: TransferAction;
  currency?: string;
  description?: string;
}

type ItemResult = {
  userId: string;
  clientRequestId: string;
  success: boolean;
  transferId?: string;
  actorId?: string;
  replayed?: boolean;
  error?: string;
  code?: string;
};

function mapTransferError(message: string): { error: string; code: string } {
  const msg = (message || "").toLowerCase();
  if (msg.includes("unauthorized"))
    return { error: "خطا در احراز هویت", code: "unauthorized" };
  if (msg.includes("forbidden"))
    return {
      error: "شما دسترسی لازم برای این عملیات را ندارید",
      code: "forbidden",
    };
  if (msg.includes("insufficient_funds"))
    return { error: "موجودی کافی نیست", code: "insufficient_funds" };
  if (msg.includes("target_not_found"))
    return { error: "کاربر مقصد پیدا نشد", code: "target_not_found" };
  if (msg.includes("client_request_id_required"))
    return {
      error: "شناسه درخواست الزامی است",
      code: "client_request_id_required",
    };
  if (msg.includes("idempotency_payload_mismatch"))
    return {
      error: "شناسه درخواست با مبلغ/مقصد/عملیات متفاوت قبلاً ثبت شده است",
      code: "idempotency_payload_mismatch",
    };
  return { error: message || "خطا در انجام انتقال", code: "transfer_failed" };
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAdminJwtContextOrThrow(request);

    let body: BulkTransferRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_json",
          message: "فرمت درخواست نامعتبر است.",
        },
        { status: 400 }
      );
    }

    const { userIds, clientRequestIds, amount, action, currency, description } =
      body;

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
      !Array.isArray(clientRequestIds) ||
      clientRequestIds.length !== userIds.length
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_payload",
          message:
            "برای هر کاربر باید یک clientRequestId ارسال شود (طول آرایه برابر userIds).",
        },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    for (const id of clientRequestIds) {
      const trimmed = String(id || "").trim();
      if (!trimmed) {
        return NextResponse.json(
          {
            ok: false,
            error: "invalid_payload",
            message: "clientRequestId خالی مجاز نیست.",
          },
          { status: 400 }
        );
      }
      if (seen.has(trimmed)) {
        return NextResponse.json(
          {
            ok: false,
            error: "invalid_payload",
            message: "clientRequestId تکراری در یک درخواست مجاز نیست.",
          },
          { status: 400 }
        );
      }
      seen.add(trimmed);
    }

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0 || !Number.isFinite(parsedAmount)) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "مبلغ باید بزرگ‌تر از صفر باشد.",
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(parsedAmount)) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "مبلغ باید عدد صحیح باشد.",
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

    if (currency && currency !== "IRR") {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "فقط IRR پشتیبانی می‌شود.",
        },
        { status: 400 }
      );
    }

    const userClient = createUserClientFromAccessToken(ctx.accessToken);
    const results: ItemResult[] = [];

    console.log("[Wallet] transfer bulk start", {
      actorId: ctx.user.id,
      count: userIds.length,
      amount: parsedAmount,
      action,
    });

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const clientRequestId = String(clientRequestIds[i]).trim();

      const { data, error } = await userClient.rpc("fn_wallet_transfer_panel", {
        p_target_id: userId,
        p_amount: parsedAmount,
        p_action: action,
        p_client_request_id: clientRequestId,
        p_description:
          description ||
          `Panel transfer (${action}) by ${ctx.role ?? "admin_panel"}`,
        p_meta: {},
      });

      if (error) {
        const mapped = mapTransferError(error.message || "");
        if (mapped.code === "idempotency_payload_mismatch") {
          financeMetricInc("duplicate_transfer_attempts");
        }
        console.error("[Wallet] transfer item failed", {
          userId,
          clientRequestId,
          message: error.message,
        });
        results.push({
          userId,
          clientRequestId,
          success: false,
          error: mapped.error,
          code: mapped.code,
        });
        continue;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const transferId = row?.transfer_id as string | undefined;
      const actorId = row?.actor_id as string | undefined;
      const replayed = Boolean(row?.replayed);

      if (replayed) {
        financeMetricInc("duplicate_transfer_attempts");
      }

      if (!actorId || actorId !== ctx.user.id) {
        results.push({
          userId,
          clientRequestId,
          success: false,
          error: "خطای امنیتی: عدم تطابق هویت اجرای RPC",
          code: "identity_mismatch",
        });
        continue;
      }

      results.push({
        userId,
        clientRequestId,
        success: true,
        transferId,
        actorId,
        replayed,
      });
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;
    const partial = successCount > 0 && failureCount > 0;

    if (partial) {
      financeMetricInc("partial_bulk_failure");
    }

    console.log("[Wallet] transfer bulk done", {
      successCount,
      failureCount,
      partial,
    });

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
          clientRequestIds,
          amount: parsedAmount,
          action,
          currency: "IRR",
          successCount,
          failureCount,
          partial,
          transferIds: results
            .map((r) => r.transferId)
            .filter(Boolean),
        },
        request
      );
    } catch (auditError) {
      console.error("[Wallet] transfer audit log failed:", auditError);
    }

    const payload = {
      ok: failureCount === 0,
      partial,
      successCount,
      failureCount,
      results,
      message:
        failureCount === 0
          ? "انتقال با موفقیت انجام شد."
          : partial
            ? "برخی انتقال‌ها موفق و برخی ناموفق بودند. نتایج را بررسی کنید."
            : results.find((r) => !r.success)?.error ||
              "خطا در انجام انتقال.",
    };

    const status = failureCount === 0 ? 200 : partial ? 207 : 500;
    return NextResponse.json(payload, { status });
  } catch (err: any) {
    const msg = err?.message;
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json(
        {
          ok: false,
          error: "unauthorized",
          message: "لطفاً دوباره وارد شوید.",
        },
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
      {
        ok: false,
        error: "unexpected_error",
        message: msg || "خطای غیرمنتظره",
      },
      { status: 500 }
    );
  }
}
