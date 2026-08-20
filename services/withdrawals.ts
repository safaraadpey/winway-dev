import { supabase } from "@/lib/supabaseClient";
import type {
  AdminWithdrawalReviewBody,
  AdminWithdrawalMarkProcessingBody,
  CreateCryptoWithdrawalRequestBody,
  CreateWithdrawalRequestBody,
  CryptoWithdrawQuoteResponse,
  CryptoWithdrawQuotesBatchResponse,
  WithdrawalKind,
  WithdrawalRequestItem,
  CryptoNetwork,
} from "@/src/types/withdrawal";

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error("خطا در احراز هویت - لطفاً دوباره وارد شوید");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function createPlayerWithdrawalRequest(
  body: CreateWithdrawalRequestBody
): Promise<{
  ok: boolean;
  requestId: string;
  status: string;
  statusLabel: string;
  replayed?: boolean;
}> {
  const headers = await authHeaders();
  const res = await fetch("/api/player/withdrawal/create", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "ثبت درخواست ناموفق بود.");
  }
  return json;
}

export async function calculateCryptoWithdrawQuote(
  tomanAmount: number,
  network: CryptoNetwork
): Promise<CryptoWithdrawQuoteResponse> {
  const headers = await authHeaders();
  const res = await fetch("/api/player/withdrawal/calculate-crypto", {
    method: "POST",
    headers,
    body: JSON.stringify({ tomanAmount, network }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "محاسبه تبدیل ناموفق بود.");
  }
  return json as CryptoWithdrawQuoteResponse;
}

export async function calculateAllCryptoWithdrawQuotes(
  tomanAmount: number
): Promise<Record<CryptoNetwork, CryptoWithdrawQuoteResponse>> {
  const headers = await authHeaders();
  const res = await fetch("/api/player/withdrawal/calculate-crypto", {
    method: "POST",
    headers,
    body: JSON.stringify({ tomanAmount, allNetworks: true }),
    cache: "no-store",
  });
  const json = (await res.json()) as CryptoWithdrawQuotesBatchResponse & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "محاسبه تبدیل ناموفق بود.");
  }

  const mapped = {} as Record<CryptoNetwork, CryptoWithdrawQuoteResponse>;
  for (const network of ["TRC20", "BEP20", "TRX"] as CryptoNetwork[]) {
    const quote = json.quotes[network];
    mapped[network] = {
      ok: true,
      ...quote,
      rates: json.rates,
    };
  }
  return mapped;
}

export async function createCryptoWithdrawalRequest(
  body: CreateCryptoWithdrawalRequestBody
): Promise<{
  ok: boolean;
  requestId: string;
  status: string;
  statusLabel: string;
  cryptoAmount: number;
  cryptoSymbol: string;
  network: string;
  lockedToman: number;
  replayed?: boolean;
}> {
  const headers = await authHeaders();
  const res = await fetch("/api/player/withdrawal/create-crypto", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "ثبت درخواست ناموفق بود.");
  }
  return json;
}

export async function loadPlayerWithdrawalList(): Promise<{
  freeBalance: number;
  requests: WithdrawalRequestItem[];
}> {
  const headers = await authHeaders();
  const res = await fetch("/api/player/withdrawal/list", {
    method: "GET",
    headers,
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "بارگذاری درخواست‌ها ناموفق بود.");
  }
  return {
    freeBalance: Number(json.freeBalance ?? 0) || 0,
    requests: (json.requests || []) as WithdrawalRequestItem[],
  };
}

export async function loadPendingWithdrawals(
  kind: WithdrawalKind = "rial"
): Promise<WithdrawalRequestItem[]> {
  const headers = await authHeaders();
  const res = await fetch(
    `/api/admin/withdrawal/pending?kind=${encodeURIComponent(kind)}`,
    {
      method: "GET",
      headers,
      cache: "no-store",
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "بارگذاری درخواست‌ها ناموفق بود.");
  }
  return (json.requests || []) as WithdrawalRequestItem[];
}

export async function reviewWithdrawal(
  body: AdminWithdrawalReviewBody
): Promise<{ ok: boolean; message?: string }> {
  const headers = await authHeaders();
  const res = await fetch("/api/admin/withdrawal/review", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "بررسی درخواست ناموفق بود.");
  }
  return json;
}

export async function cancelPlayerWithdrawalRequest(
  requestId: string
): Promise<{ ok: boolean; message?: string }> {
  const headers = await authHeaders();
  const res = await fetch("/api/player/withdrawal/cancel", {
    method: "POST",
    headers,
    body: JSON.stringify({ requestId }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "لغو درخواست ناموفق بود.");
  }
  return json;
}

export async function markWithdrawalProcessing(
  body: AdminWithdrawalMarkProcessingBody
): Promise<{ ok: boolean; message?: string }> {
  const headers = await authHeaders();
  const res = await fetch("/api/admin/withdrawal/mark-processing", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "تغییر وضعیت ناموفق بود.");
  }
  return json;
}

export async function loadPendingWithdrawalAlertSummary(
  userRole: "admin" | "agent" | string
): Promise<{ total: number; rial: number; crypto: number }> {
  if (userRole === "agent") {
    const rial = await loadPendingWithdrawals("rial");
    return { total: rial.length, rial: rial.length, crypto: 0 };
  }

  if (userRole === "admin") {
    const [rial, crypto] = await Promise.all([
      loadPendingWithdrawals("rial"),
      loadPendingWithdrawals("crypto"),
    ]);
    return {
      rial: rial.length,
      crypto: crypto.length,
      total: rial.length + crypto.length,
    };
  }

  return { total: 0, rial: 0, crypto: 0 };
}
