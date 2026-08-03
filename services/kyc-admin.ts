import { supabase } from "@/lib/supabaseClient";
import type {
  AdminKycListResponse,
  AdminKycPurgeImageRequest,
  AdminKycReviewRequest,
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

export async function fetchAdminKycQueue(): Promise<AdminKycListResponse> {
  const headers = await authHeaders();
  const res = await fetch("/api/admin/kyc", {
    method: "GET",
    headers,
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || body?.error || "KYC_ADMIN_LIST_FAILED");
  }
  return body;
}

export async function reviewAdminKyc(
  payload: AdminKycReviewRequest
): Promise<{ ok: true; status: string; message: string }> {
  const headers = await authHeaders();
  const res = await fetch("/api/admin/kyc/review", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || body?.error || "KYC_ADMIN_REVIEW_FAILED");
  }
  return body;
}

export async function purgeAdminKycImage(
  payload: AdminKycPurgeImageRequest
): Promise<{ ok: true; purged: boolean; message: string }> {
  const headers = await authHeaders();
  const res = await fetch("/api/admin/kyc/purge-image", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || body?.error || "KYC_PURGE_FAILED");
  }
  return body;
}
