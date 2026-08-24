import { supabase } from "@/lib/supabaseClient";
import type {
  AdminGamesReportResult,
  LoadAdminGamesReportParams,
  LoadPlayerGamesReportParams,
  PlayerGamesReportResult,
} from "@/src/types/games-report";

type GamesReportCacheEntry = {
  key: string;
  fetchedAtMs: number;
  data: AdminGamesReportResult;
};

const gamesReportCache = new Map<string, GamesReportCacheEntry>();

function makeCacheKey(params: LoadAdminGamesReportParams) {
  return [
    params.period,
    params.from || "",
    params.to || "",
    String(params.page || 1),
    String(params.pageSize || 20),
  ].join("|");
}

export function clearGamesReportCache() {
  gamesReportCache.clear();
}

export async function loadAdminGamesReport(
  params: LoadAdminGamesReportParams
): Promise<AdminGamesReportResult> {
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
    const cached = gamesReportCache.get(key);
    if (cached) {
      const ageMs = Date.now() - cached.fetchedAtMs;
      if (ageMs >= 0 && ageMs <= maxAgeMs) {
        return cached.data;
      }
    }
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

  const response = await fetch(`/api/admin/games/report?${qs.toString()}`, {
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
    throw new Error(payload?.message || payload?.error || "خطا در دریافت گزارش بازی‌ها");
  }

  const result: AdminGamesReportResult = {
    items: payload?.data?.items || [],
    totalCount: Number(payload?.data?.totalCount || 0),
    page: Number(payload?.data?.page || page),
    pageSize: Number(payload?.data?.pageSize || pageSize),
  };

  gamesReportCache.set(key, {
    key,
    fetchedAtMs: Date.now(),
    data: result,
  });

  return result;
}

type PlayerGamesReportCacheEntry = {
  key: string;
  fetchedAtMs: number;
  data: PlayerGamesReportResult;
};

const playerGamesReportCache = new Map<string, PlayerGamesReportCacheEntry>();

function makePlayerCacheKey(params: LoadPlayerGamesReportParams) {
  return [String(params.page || 1), String(params.pageSize || 20)].join("|");
}

export function clearPlayerGamesReportCache() {
  playerGamesReportCache.clear();
}

export async function loadPlayerGamesReport(
  params: LoadPlayerGamesReportParams = {}
): Promise<PlayerGamesReportResult> {
  const { page = 1, pageSize = 20, maxAgeMs = 30_000, force = false } = params;
  const key = makePlayerCacheKey({ page, pageSize });

  if (!force) {
    const cached = playerGamesReportCache.get(key);
    if (cached) {
      const ageMs = Date.now() - cached.fetchedAtMs;
      if (ageMs >= 0 && ageMs <= maxAgeMs) {
        return cached.data;
      }
    }
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error("خطا در احراز هویت");
  }

  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));

  const response = await fetch(`/api/player/games/report?${qs.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("خطا در پاسخ سرور");
  }

  const body = payload as {
    ok?: boolean;
    message?: string;
    error?: string;
    data?: PlayerGamesReportResult;
  };

  if (!response.ok || body?.ok === false) {
    throw new Error(body?.message || body?.error || "خطا در دریافت گزارش بازی‌ها");
  }

  const result: PlayerGamesReportResult = {
    items: body?.data?.items || [],
    totalCount: Number(body?.data?.totalCount || 0),
    page: Number(body?.data?.page || page),
    pageSize: Number(body?.data?.pageSize || pageSize),
    windowFrom: String(body?.data?.windowFrom || ""),
    windowTo: String(body?.data?.windowTo || ""),
  };

  playerGamesReportCache.set(key, {
    key,
    fetchedAtMs: Date.now(),
    data: result,
  });

  return result;
}

