import { supabase } from "@/lib/supabaseClient";
import type {
  KycNotificationResponse,
  KycStatusResponse,
  KycSubmitRequest,
  KycSubmitResponse,
} from "@/src/types/kyc";

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchKycStatus(): Promise<KycStatusResponse> {
  const headers = await authHeaders();
  const res = await fetch("/api/player/kyc", {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || body?.error || "KYC_STATUS_FAILED");
  }

  return res.json();
}

export async function submitKyc(
  payload: KycSubmitRequest
): Promise<KycSubmitResponse> {
  const headers = await authHeaders();
  const res = await fetch("/api/player/kyc", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(
      body?.message || body?.error || "KYC_SUBMIT_FAILED"
    ) as Error & { code?: string; status?: number };
    err.code = body?.error;
    err.status = res.status;
    throw err;
  }

  return body;
}

export async function fetchKycNotification(): Promise<KycNotificationResponse> {
  const headers = await authHeaders();
  const res = await fetch("/api/player/kyc/notification", {
    method: "GET",
    headers,
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || body?.error || "KYC_NOTIFICATION_FAILED");
  }
  return body;
}

export async function acknowledgeKycNotification(
  submissionId: string
): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch("/api/player/kyc/notification", {
    method: "POST",
    headers,
    body: JSON.stringify({ submissionId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || body?.error || "KYC_ACK_FAILED");
  }
}
