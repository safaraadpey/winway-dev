import { supabase } from "@/lib/supabaseClient";
import type {
  LoadTournamentReportParams,
  TournamentReportResult,
} from "@/src/types/tournaments-report";

type CacheEntry = {
  key: string;
  fetchedAtMs: number;
  data: TournamentReportResult;
};

const reportCache = new Map<string, CacheEntry>();

function makeCacheKey(params: LoadTournamentReportParams) {
  return [
    params.period,
    params.from || "",
    params.to || "",
    String(params.page || 1),
    String(params.pageSize || 20),
  ].join("|");
}

function readFreshCache(
  key: string,
  maxAgeMs: number
): TournamentReportResult | null {
  const cached = reportCache.get(key);
  if (!cached) return null;
  const ageMs = Date.now() - cached.fetchedAtMs;
  if (ageMs < 0 || ageMs > maxAgeMs) return null;
  return cached.data;
}

export function clearTournamentReportCache() {
  reportCache.clear();
}

export function getCachedTournamentReport(
  params: LoadTournamentReportParams
): TournamentReportResult | null {
  const maxAgeMs = params.maxAgeMs ?? 300_000;
  const key = makeCacheKey(params);
  return readFreshCache(key, maxAgeMs);
}

export async function loadTournamentReport(
  params: LoadTournamentReportParams
): Promise<TournamentReportResult> {
  const {
    period,
    from,
    to,
    page = 1,
    pageSize = 20,
    maxAgeMs = 30_000,
    force = false,
  } = params;

  const key = makeCacheKey({ period, from, to, page, pageSize });
  if (!force) {
    const cached = readFreshCache(key, maxAgeMs);
    if (cached) return cached;
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error("خطا در احراز هویت");
  }

  const qs = new URLSearchParams();
  qs.set("period", period);
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  if (period === "range") {
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
  }

  const response = await fetch(`/api/admin/tournaments/report?${qs.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("خطا در پاسخ سرور");
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || payload?.error || "خطا در دریافت گزارش تورنومنت‌ها");
  }

  const result: TournamentReportResult = {
    items: payload?.data?.items || [],
    totalCount: Number(payload?.data?.totalCount || 0),
    page: Number(payload?.data?.page || page),
    pageSize: Number(payload?.data?.pageSize || pageSize),
    viewerRole: payload?.data?.viewerRole || "agent",
  };

  reportCache.set(key, {
    key,
    fetchedAtMs: Date.now(),
    data: result,
  });

  return result;
}
