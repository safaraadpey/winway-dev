/** Deposit amount limits and environment helpers (server-only). */

export type DepositEnvironment = "development" | "production";

export function resolveDepositEnvironment(): DepositEnvironment {
  const explicit = (process.env.DEPOSIT_ENVIRONMENT || "").toLowerCase();
  if (explicit === "production" || explicit === "development") {
    return explicit;
  }
  // Prefer APP_ENV / explicit production host signals over NODE_ENV alone
  if (process.env.VERCEL_ENV === "production") return "production";
  if ((process.env.NEXT_PUBLIC_APP_ORIGIN || "").includes("dingmoney.org")
    && !(process.env.NEXT_PUBLIC_APP_ORIGIN || "").includes("dev.")) {
    return "production";
  }
  return "development";
}

export function getDepositAmountLimitsToman(): { min: number; max: number } {
  const min = Number(process.env.DEPOSIT_MIN_AMOUNT_TOMAN || 10_000);
  const max = Number(process.env.DEPOSIT_MAX_AMOUNT_TOMAN || 500_000_000);
  return {
    min: Number.isFinite(min) && min > 0 ? min : 10_000,
    max: Number.isFinite(max) && max >= min ? max : 500_000_000,
  };
}

export function validateDepositAmountToman(amount: number): {
  ok: true;
  amount: number;
} | { ok: false; code: string; message: string } {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    return {
      ok: false,
      code: "invalid_amount",
      message: "مبلغ باید یک عدد صحیح باشد.",
    };
  }
  const { min, max } = getDepositAmountLimitsToman();
  if (amount < min) {
    return {
      ok: false,
      code: "amount_too_small",
      message: `حداقل مبلغ شارژ ${min.toLocaleString("en-US")} تومان است.`,
    };
  }
  if (amount > max) {
    return {
      ok: false,
      code: "amount_too_large",
      message: `حداکثر مبلغ شارژ ${max.toLocaleString("en-US")} تومان است.`,
    };
  }
  return { ok: true, amount };
}

export function resolvePaymentReturnUrl(depositId: string): string {
  const base =
    process.env.HAMIPAY_RETURN_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.NEXT_PUBLIC_ADMIN_ORIGIN ||
    "http://localhost:3000";
  const trimmed = base.replace(/\/$/, "");
  return `${trimmed}/payment/callback?depositId=${encodeURIComponent(depositId)}`;
}
