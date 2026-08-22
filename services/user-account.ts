// services/user-account.ts
//
// Service helpers for user account detail page (admin / agent / super).

import { supabase } from "@/lib/supabaseClient";
import type { AdminSubRole } from "@/lib/auth-helpers";
import type {
  UserAccountData,
  UserAccountInfo,
  UserAccountActivity,
  UserAccountPeriod,
  UserAccountTransaction,
} from "@/src/types/user-account";

// تبدیل UUID به ID ده‌رقمی
function makeShortIdFromUuid(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(31, hash) + id.charCodeAt(i);
  }
  const num = (hash >>> 0) % 1_000_000_0000; // 10^10
  return num.toString().padStart(10, "0");
}

export interface LoadUserAccountDataParams {
  maxAgeMs?: number;
  force?: boolean;
}

type UserAccountDataCacheEntry = {
  userId: string;
  fetchedAtMs: number;
  data: UserAccountData | null;
};

// In-memory cache to avoid full refetch on back/forward navigation.
// Note: this runs in the browser only; it resets on full refresh.
const userAccountDataCache = new Map<string, UserAccountDataCacheEntry>();

export function getCachedUserAccountData(
  userId: string,
  params: { maxAgeMs?: number } = {}
): UserAccountData | null {
  const { maxAgeMs = Infinity } = params;
  const entry = userAccountDataCache.get(userId);
  if (!entry) return null;
  const ageMs = Date.now() - entry.fetchedAtMs;
  if (ageMs < 0 || ageMs > maxAgeMs) return null;
  return entry.data;
}

export function primeUserAccountDataCache(userId: string, data: UserAccountData | null) {
  userAccountDataCache.set(userId, {
    userId,
    fetchedAtMs: Date.now(),
    data,
  });
}

export function clearUserAccountDataCache(userId?: string) {
  if (userId) {
    userAccountDataCache.delete(userId);
  } else {
    userAccountDataCache.clear();
  }
}

async function loadNicknameViaApi(userId: string): Promise<string | null> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) return null;

  try {
    const response = await fetch("/api/admin/users/nicknames", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_ids: [userId] }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !Array.isArray(payload?.data)) return null;
    const row = (payload.data as any[]).find((r) => String(r?.user_id || "") === userId);
    const nickname = String(row?.nickname || "").trim();
    return nickname || null;
  } catch {
    return null;
  }
}

/**
 * محاسبه تاریخ شروع برای یک دوره
 */
function getPeriodStart(period: UserAccountPeriod): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (period === "day") {
    return now;
  } else if (period === "week") {
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
    return new Date(now.getFullYear(), now.getMonth(), diff);
  } else {
    // month
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

type TicketActivityRow = { room_id: string; created_at: string };

type MonthlyActivitySource =
  | {
      kind: "commissions_log";
      resultsRows: Array<{ win_type: string; created_at: string }>;
      commissionRows: Array<Record<string, any>>;
      manualRows: Array<{ amount: any; type: string; created_at: string }>;
      ticketRows: TicketActivityRow[];
    }
  | {
      kind: "admin_commission_tx";
      resultsRows: Array<{ win_type: string; created_at: string }>;
      commissionTxRows: Array<{ amount: any; created_at: string }>;
      manualRows: Array<{ amount: any; type: string; created_at: string }>;
      ticketRows: TicketActivityRow[];
    };

async function loadMonthlyActivitySource(
  userId: string,
  userRole: UserAccountInfo["role"]
): Promise<MonthlyActivitySource> {
  const monthStart = getPeriodStart("month").toISOString();

  const resultsPromise = supabase
    .from("results")
    .select("win_type, created_at")
    .eq("user_id", userId)
    .gte("created_at", monthStart);

  const manualPromise = supabase
    .from("transactions")
    .select("amount, type, created_at")
    .eq("user_id", userId)
    .eq("source_kind", "manual_panel")
    .in("type", ["deposit", "withdraw"])
    .gte("created_at", monthStart);

  const ticketsPromise =
    userRole === "player"
      ? supabase
          .from("tickets")
          .select("room_id, created_at")
          .eq("player_user_id", userId)
          .in("reservation_status", ["confirmed", "consumed"])
          .gte("created_at", monthStart)
      : Promise.resolve({ data: [] as TicketActivityRow[], error: null });

  if (userRole === "admin") {
    const adminCommissionPromise = supabase
      .from("transactions")
      .select("amount, created_at")
      .eq("user_id", userId)
      .eq("type", "fee_admin")
      .eq("source_kind", "ticket_commission")
      .gte("created_at", monthStart);

    const [resultsRes, manualRes, commRes, ticketsRes] = await Promise.all([
      resultsPromise,
      manualPromise,
      adminCommissionPromise,
      ticketsPromise,
    ]);

    if (resultsRes.error) {
      console.error("loadMonthlyActivitySource: results error", resultsRes.error);
    }
    if (manualRes.error) {
      console.error("loadMonthlyActivitySource: manual tx error", manualRes.error);
    }
    if (commRes.error) {
      console.error("loadMonthlyActivitySource: admin commission tx error", commRes.error);
    }
    if (ticketsRes.error) {
      console.error("loadMonthlyActivitySource: tickets error", ticketsRes.error);
    }

    return {
      kind: "admin_commission_tx",
      resultsRows: (resultsRes.data || []) as any,
      manualRows: (manualRes.data || []) as any,
      commissionTxRows: (commRes.data || []) as any,
      ticketRows: (ticketsRes.data || []) as TicketActivityRow[],
    };
  }

  // commissions_log (player/agent/super)
  // IMPORTANT: build query in one go to keep TS types stable (Supabase query builder
  // encodes selected columns in the type).
  let selectCols = "commission_base, created_at";
  let filterCol: "player_id" | "agent_id" | "super_id" = "player_id";

  if (userRole === "player") {
    selectCols = "agent_amount, super_amount, admin_amount, commission_base, created_at";
    filterCol = "player_id";
  } else if (userRole === "agent") {
    selectCols = "agent_amount, commission_base, created_at";
    filterCol = "agent_id";
  } else if (userRole === "super") {
    selectCols = "super_amount, commission_base, created_at";
    filterCol = "super_id";
  }

  const commissionsQuery = supabase
    .from("commissions_log")
    .select(selectCols)
    .eq(filterCol, userId)
    .eq("status", "settled")
    .gte("created_at", monthStart);

  const [resultsRes, manualRes, commRes, ticketsRes] = await Promise.all([
    resultsPromise,
    manualPromise,
    commissionsQuery,
    ticketsPromise,
  ]);

  if (resultsRes.error) {
    console.error("loadMonthlyActivitySource: results error", resultsRes.error);
  }
  if (manualRes.error) {
    console.error("loadMonthlyActivitySource: manual tx error", manualRes.error);
  }
  if (commRes.error) {
    console.error("loadMonthlyActivitySource: commissions_log error", commRes.error);
  }
  if (ticketsRes.error) {
    console.error("loadMonthlyActivitySource: tickets error", ticketsRes.error);
  }

  return {
    kind: "commissions_log",
    resultsRows: (resultsRes.data || []) as any,
    manualRows: (manualRes.data || []) as any,
    commissionRows: (commRes.data || []) as any,
    ticketRows: (ticketsRes.data || []) as TicketActivityRow[],
  };
}

function buildActivitiesFromMonthlySource(
  source: MonthlyActivitySource,
  userRole: UserAccountInfo["role"]
): Record<UserAccountPeriod, UserAccountActivity> {
  const dayStartMs = getPeriodStart("day").getTime();
  const weekStartMs = getPeriodStart("week").getTime();
  const monthStartMs = getPeriodStart("month").getTime();

  const results = (source.resultsRows || []).map((r) => ({
    ms: Date.parse(r.created_at),
    winType: r.win_type,
  }));

  const tickets = (source.ticketRows || []).map((t) => ({
    ms: Date.parse(t.created_at),
    roomId: t.room_id,
  }));

  const manual = (source.manualRows || []).map((t) => ({
    ms: Date.parse(t.created_at),
    amount: Number(t.amount || 0),
    type: t.type,
  }));

  const getGamesPlayed = (startMs: number) => {
    const rooms = new Set<string>();
    for (const t of tickets) {
      if (t.ms >= startMs && t.roomId) rooms.add(t.roomId);
    }
    return rooms.size;
  };

  const getLineFullWins = (startMs: number) => {
    let lineWins = 0;
    let fullWins = 0;
    for (const r of results) {
      if (r.ms >= startMs) {
        if (r.winType === "line") lineWins += 1;
        else if (r.winType === "full") fullWins += 1;
      }
    }
    return { lineWins, fullWins };
  };

  const getDepositsWithdrawals = (startMs: number) => {
    let deposits = 0;
    let withdrawals = 0;
    for (const t of manual) {
      if (t.ms >= startMs) {
        if (t.type === "deposit") deposits += t.amount;
        else if (t.type === "withdraw") withdrawals += t.amount;
      }
    }
    return { deposits, withdrawals, net: deposits - withdrawals };
  };

  const getCommission = (startMs: number) => {
    let commission = 0;
    let commissionTotal: number | null = null;

    if (userRole === "admin" && source.kind === "admin_commission_tx") {
      commission = (source.commissionTxRows || []).reduce((sum, row) => {
        const ms = Date.parse(row.created_at);
        if (ms < startMs) return sum;
        return sum + Number(row.amount || 0);
      }, 0);
      commissionTotal = null;
      return { commission, commissionTotal };
    }

    if (source.kind !== "commissions_log") {
      return { commission: 0, commissionTotal: null };
    }

    commissionTotal = 0;
    for (const row of source.commissionRows || []) {
      const ms = Date.parse(String((row as any).created_at));
      if (ms < startMs) continue;

      if (userRole === "player") {
        commission +=
          Number((row as any).agent_amount || 0) +
          Number((row as any).super_amount || 0) +
          Number((row as any).admin_amount || 0);
      } else if (userRole === "agent") {
        commission += Number((row as any).agent_amount || 0);
      } else if (userRole === "super") {
        commission += Number((row as any).super_amount || 0);
      }

      commissionTotal += Number((row as any).commission_base || 0);
    }

    return { commission, commissionTotal };
  };

  const buildOne = (period: UserAccountPeriod, startMs: number): UserAccountActivity => {
    const gamesPlayed = getGamesPlayed(startMs);
    const { lineWins, fullWins } = getLineFullWins(startMs);
    const { deposits, withdrawals, net } = getDepositsWithdrawals(startMs);
    const { commission, commissionTotal } = getCommission(startMs);
    return {
      period,
      gamesPlayed,
      lineWins,
      fullWins,
      commission,
      commissionTotal,
      deposits,
      withdrawals,
      net,
    };
  };

  return {
    day: buildOne("day", dayStartMs),
    week: buildOne("week", weekStartMs),
    month: buildOne("month", monthStartMs),
  };
}

const SUBORDINATE_IDS_CHUNK_SIZE = 100;

/**
 * شناسه کاربران زیرمجموعه برای جمع دارایی:
 * - super: ایجنت‌ها + پلیرهای مستقیم و زیر ایجنت‌ها
 * - agent: فقط پلیرهای زیرمجموعه
 */
async function getSubordinateUserIdsForAssets(
  userId: string,
  role: "super" | "agent"
): Promise<string[]> {
  const ids = new Set<string>();

  if (role === "agent") {
    const { data: directPlayers, error: directPlayersError } = await supabase
      .from("users")
      .select("id")
      .eq("parent_id", userId)
      .eq("role", "player");

    if (directPlayersError) {
      console.error("[UserAccount] subordinate players (agent) error", directPlayersError);
    } else {
      (directPlayers || []).forEach((row) => ids.add(row.id));
    }

    const { data: affiliationRows, error: affiliationError } = await supabase
      .from("player_affiliation")
      .select("user_id")
      .eq("agent_id", userId);

    if (affiliationError) {
      console.error("[UserAccount] subordinate affiliation (agent) error", affiliationError);
    } else {
      (affiliationRows || []).forEach((row) => {
        if (row.user_id) ids.add(row.user_id);
      });
    }
  } else {
    const { data: agents, error: agentsError } = await supabase
      .from("users")
      .select("id")
      .eq("parent_id", userId)
      .eq("role", "agent");

    if (agentsError) {
      console.error("[UserAccount] subordinate agents (super) error", agentsError);
    }

    const agentIds = (agents || []).map((row) => row.id);
    agentIds.forEach((id) => ids.add(id));

    const { data: directPlayers, error: directPlayersError } = await supabase
      .from("users")
      .select("id")
      .eq("parent_id", userId)
      .eq("role", "player");

    if (directPlayersError) {
      console.error("[UserAccount] subordinate direct players (super) error", directPlayersError);
    } else {
      (directPlayers || []).forEach((row) => ids.add(row.id));
    }

    if (agentIds.length > 0) {
      const { data: playersUnderAgents, error: playersUnderAgentsError } =
        await supabase
          .from("users")
          .select("id")
          .in("parent_id", agentIds)
          .eq("role", "player");

      if (playersUnderAgentsError) {
        console.error(
          "[UserAccount] subordinate players under agents (super) error",
          playersUnderAgentsError
        );
      } else {
        (playersUnderAgents || []).forEach((row) => ids.add(row.id));
      }
    }

    const { data: affiliationRows, error: affiliationError } = await supabase
      .from("player_affiliation")
      .select("user_id")
      .eq("super_id", userId);

    if (affiliationError) {
      console.error("[UserAccount] subordinate affiliation (super) error", affiliationError);
    } else {
      (affiliationRows || []).forEach((row) => {
        if (row.user_id) ids.add(row.user_id);
      });
    }
  }

  return Array.from(ids);
}

async function sumSubordinateWalletAssets(subordinateIds: string[]): Promise<{
  dingBalance: number;
  tomanBalance: number;
}> {
  if (subordinateIds.length === 0) {
    return { dingBalance: 0, tomanBalance: 0 };
  }

  let dingBalance = 0;
  let tomanBalance = 0;

  for (let i = 0; i < subordinateIds.length; i += SUBORDINATE_IDS_CHUNK_SIZE) {
    const chunk = subordinateIds.slice(i, i + SUBORDINATE_IDS_CHUNK_SIZE);

    const { data: dingRows, error: dingError } = await supabase
      .from("ding_balances")
      .select("balance")
      .in("user_id", chunk);

    if (dingError) {
      console.warn("[UserAccount] subordinate ding_balances error", dingError.message);
    } else {
      dingBalance += (dingRows || []).reduce(
        (sum, row) => sum + Number(row.balance || 0),
        0
      );
    }

    const { data: walletRows, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .in("user_id", chunk)
      .eq("currency", "IRR");

    if (walletError) {
      console.warn("[UserAccount] subordinate wallets error", walletError.message);
    } else {
      tomanBalance += (walletRows || []).reduce(
        (sum, row) => sum + Number(row.balance || 0),
        0
      );
    }
  }

  return { dingBalance, tomanBalance };
}

async function loadSubordinateAssets(
  userId: string,
  role: UserAccountInfo["role"]
): Promise<UserAccountInfo["subordinateAssets"]> {
  if (role !== "super" && role !== "agent") {
    return null;
  }

  const subordinateIds = await getSubordinateUserIdsForAssets(userId, role);
  const totals = await sumSubordinateWalletAssets(subordinateIds);

  console.info("[UserAccount] subordinate assets loaded", {
    userId,
    role,
    memberCount: subordinateIds.length,
    dingBalance: totals.dingBalance,
    tomanBalance: totals.tomanBalance,
  });

  return totals;
}

/**
 * بارگذاری اطلاعات پایه کاربر
 */
async function loadUserAccountInfo(userId: string): Promise<UserAccountInfo | null> {
  try {
    // گرفتن اطلاعات کاربر
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, username, role, last_login_at, parent_id, status, admin_sub_role")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      console.error("loadUserAccountInfo: user error", userError);
      return null;
    }

    if ((user as { admin_sub_role?: string | null }).admin_sub_role === "dev_panel") {
      const {
        data: { user: actor },
      } = await supabase.auth.getUser();
      const { data: adminZero } = await supabase
        .from("users")
        .select("id")
        .eq("username", "adminzero")
        .eq("role", "admin")
        .maybeSingle();

      if (!actor?.id || !adminZero?.id || actor.id !== adminZero.id) {
        return null;
      }
    }

    // گرفتن موجودی Ding
    const { data: dingBalanceData, error: dingError } = await supabase
      .from("ding_balances")
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (dingError) {
      console.warn("loadUserAccountInfo: ding_balances error", dingError.message);
    }

    // گرفتن موجودی تومان
    const { data: walletData, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .eq("currency", "IRR")
      .single();

    if (walletError) {
      console.warn("loadUserAccountInfo: wallets error", walletError.message);
    }

    // گرفتن اطلاعات ایجنت و سوپر از player_affiliation
    const { data: affiliationData, error: affiliationError } = await supabase
      .from("player_affiliation")
      .select("agent_id, super_id")
      .eq("user_id", userId)
      .single();

    let agentId: string | null = null;
    let agentUsername: string | null = null;
    let agentShortId: string | null = null;
    let superId: string | null = null;
    let superUsername: string | null = null;
    let superShortId: string | null = null;

    if (!affiliationError && affiliationData) {
      // گرفتن اطلاعات ایجنت
      if (affiliationData.agent_id) {
        const { data: agentData } = await supabase
          .from("users")
          .select("id, username")
          .eq("id", affiliationData.agent_id)
          .single();

        if (agentData) {
          agentId = agentData.id;
          agentUsername = agentData.username || null;
          agentShortId = makeShortIdFromUuid(agentData.id);
        }
      }

      // گرفتن اطلاعات سوپر
      if (affiliationData.super_id) {
        const { data: superData } = await supabase
          .from("users")
          .select("id, username")
          .eq("id", affiliationData.super_id)
          .single();

        if (superData) {
          superId = superData.id;
          superUsername = superData.username || null;
          superShortId = makeShortIdFromUuid(superData.id);
        }
      }
    }

    // همچنین بررسی parent_id برای ایجنت/سوپر
    if ((user as any).parent_id) {
      const parentId = (user as any).parent_id as string;

      // اگر player_affiliation نداریم، برای پلیر از parent_id استفاده می‌کنیم
      if (user.role === "player" && !affiliationData) {
        const { data: parentUser } = await supabase
          .from("users")
          .select("id, username, role, parent_id")
          .eq("id", parentId)
          .single();

        if (parentUser) {
          if (parentUser.role === "agent") {
            // ایجنت بالاسری
            agentId = parentUser.id;
            agentUsername = parentUser.username || null;
            agentShortId = makeShortIdFromUuid(parentUser.id);

            // اگر ایجنت خودش سوپر بالاسری دارد، آن‌را هم پیدا کن
            if (parentUser.parent_id) {
              const { data: superUser } = await supabase
                .from("users")
                .select("id, username, role")
                .eq("id", parentUser.parent_id as string)
                .single();

              if (superUser && superUser.role === "super") {
                superId = superUser.id;
                superUsername = superUser.username || null;
                superShortId = makeShortIdFromUuid(superUser.id);
              }
            }
          } else if (parentUser.role === "super") {
            // فقط سوپر بالاسری (بدون ایجنت)
            superId = parentUser.id;
            superUsername = parentUser.username || null;
            superShortId = makeShortIdFromUuid(parentUser.id);
          }
        }
      }

      // برای ایجنت‌ها، اگر هنوز سوپر مشخص نشده، از parent_id به عنوان سوپر بالاسری استفاده می‌کنیم
      if (user.role === "agent" && !superId) {
        const { data: parentUser } = await supabase
          .from("users")
          .select("id, username, role")
          .eq("id", parentId)
          .single();

        if (parentUser && parentUser.role === "super") {
          superId = parentUser.id;
          superUsername = parentUser.username || null;
          superShortId = makeShortIdFromUuid(parentUser.id);
        }
      }
    }

    const dingBalance = Number(dingBalanceData?.balance || 0);
    const tomanBalance = Number(walletData?.balance || 0);

    // گرفتن درصد کانیات از Admin API (RLS-safe) برای agent/super
    let commissionPercent: number | null = null;
    if (user.role === "agent" || user.role === "super") {
      try {
        const { callAdminApi } = await import("@/lib/adminApiClient");
        const data = await callAdminApi<{ commission_percent: number | null }>(
          `/api/admin/users/set-commission?user_id=${encodeURIComponent(userId)}`,
          { method: "GET" }
        );
        commissionPercent =
          typeof data?.commission_percent === "number"
            ? data.commission_percent
            : null;
      } catch (apiErr) {
        console.warn("loadUserAccountInfo: commission via API failed, fallback to direct read", apiErr);
        const { data: commissionData, error: commissionError } = await supabase
          .from("user_commissions")
          .select("agent_commission, super_commission")
          .eq("user_id", userId)
          .maybeSingle();

        if (!commissionError && commissionData) {
          if (user.role === "agent") {
            commissionPercent = commissionData.agent_commission
              ? Number(commissionData.agent_commission) * 100
              : null;
          } else if (user.role === "super") {
            commissionPercent = commissionData.super_commission
              ? Number(commissionData.super_commission) * 100
              : null;
          }
        }
      }
    }

    // گرفتن یادداشت شخصی از user_notes
    let personalNote: string | null = null;
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        const { data: noteData, error: noteError } = await supabase
          .from("user_notes")
          .select("note")
          .eq("user_id", userId)
          .eq("author_id", currentUser.id)
          .single();

        if (!noteError && noteData) {
          personalNote = noteData.note || null;
        }
      }
    } catch (err) {
      console.error("loadUserAccountInfo: error loading personal note", err);
    }

    const username = user.username || "نامشخص";
    // اولویت: nickname (از API سروری برای عبور از RLS) > username
    let nickname = await loadNicknameViaApi(userId);
    if (!nickname) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("nickname")
        .eq("user_id", userId)
        .single();
      nickname = profile?.nickname || null;
    }
    const displayName = nickname || username;

    const subordinateAssets =
      user.role === "super" || user.role === "agent"
        ? await loadSubordinateAssets(userId, user.role as "super" | "agent")
        : null;

    return {
      id: user.id,
      shortId: makeShortIdFromUuid(user.id),
      username,
      displayName,
      role: user.role as UserAccountInfo["role"],
      adminSubRole: (user as any).admin_sub_role as AdminSubRole | null,
      parentId: (user as any).parent_id as string | null,
      dingBalance,
      tomanBalance,
      lastLoginAt: user.last_login_at || null,
      agentId,
      agentUsername,
      agentShortId,
      superId,
      superUsername,
      superShortId,
      personalNote,
      isSuspended: (user as any).status === "suspended",
      commissionPercent,
      subordinateAssets,
    };
  } catch (err) {
    console.error("loadUserAccountInfo unexpected error:", err);
    return null;
  }
}

/**
 * محاسبه آمار فعالیت کاربر برای یک دوره
 */
async function calculateUserActivity(
  userId: string,
  period: UserAccountPeriod,
  userRole: UserAccountInfo["role"]
): Promise<UserAccountActivity> {
  try {
    const periodStart = getPeriodStart(period);

    // محاسبه تعداد برد خطی و پر از results
    const { data: resultsData, error: resultsError } = await supabase
      .from("results")
      .select("win_type")
      .eq("user_id", userId)
      .gte("created_at", periodStart.toISOString());

    if (resultsError) {
      console.error("calculateUserActivity: results error", resultsError);
    }

    const lineWins = (resultsData || []).filter((r: any) => r.win_type === "line").length;
    const fullWins = (resultsData || []).filter((r: any) => r.win_type === "full").length;

    // تعداد بازی = اتاق‌های متمایزی که پلیر تیکت معتبر خریده
    let gamesPlayed = 0;
    if (userRole === "player") {
      const { data: ticketsData, error: ticketsError } = await supabase
        .from("tickets")
        .select("room_id")
        .eq("player_user_id", userId)
        .in("reservation_status", ["confirmed", "consumed"])
        .gte("created_at", periodStart.toISOString());

      if (ticketsError) {
        console.error("calculateUserActivity: tickets error", ticketsError);
      }

      gamesPlayed = new Set(
        (ticketsData || [])
          .map((t: any) => t.room_id)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      ).size;
    }

    // محاسبه کانیات:
    // - player: مجموع کمیسیون‌های ساخته‌شده از تیکت‌های خودش (agent+super+admin)
    // - agent: مجموع سهم agent روی تیکت‌های زیرمجموعه
    // - super: مجموع سهم super روی تیکت‌های زیرمجموعه
    // - admin: از transactions (fee_admin) چون commissions_log به admin خاصی اشاره نمی‌کند
    let commission = 0;
    let commissionTotal: number | null = null;
    if (userRole === "player") {
      const { data: commissionData, error: commissionError } = await supabase
        .from("commissions_log")
        .select("agent_amount, super_amount, admin_amount, commission_base")
        .eq("player_id", userId)
        .eq("status", "settled")
        .gte("created_at", periodStart.toISOString());

      if (commissionError) {
        console.error("calculateUserActivity: commissions_log(player) error", commissionError);
      }

      commission = (commissionData || []).reduce((sum: number, row: any) => {
        return (
          sum +
          Number(row.agent_amount || 0) +
          Number(row.super_amount || 0) +
          Number(row.admin_amount || 0)
        );
      }, 0);
      commissionTotal = (commissionData || []).reduce(
        (sum: number, row: any) => sum + Number(row.commission_base || 0),
        0
      );
    } else if (userRole === "agent") {
      const { data: commissionData, error: commissionError } = await supabase
        .from("commissions_log")
        .select("agent_amount, commission_base")
        .eq("agent_id", userId)
        .eq("status", "settled")
        .gte("created_at", periodStart.toISOString());

      if (commissionError) {
        console.error("calculateUserActivity: commissions_log(agent) error", commissionError);
      }

      commission = (commissionData || []).reduce(
        (sum: number, row: any) => sum + Number(row.agent_amount || 0),
        0
      );
      commissionTotal = (commissionData || []).reduce(
        (sum: number, row: any) => sum + Number(row.commission_base || 0),
        0
      );
    } else if (userRole === "super") {
      const { data: commissionData, error: commissionError } = await supabase
        .from("commissions_log")
        .select("super_amount, commission_base")
        .eq("super_id", userId)
        .eq("status", "settled")
        .gte("created_at", periodStart.toISOString());

      if (commissionError) {
        console.error("calculateUserActivity: commissions_log(super) error", commissionError);
      }

      commission = (commissionData || []).reduce(
        (sum: number, row: any) => sum + Number(row.super_amount || 0),
        0
      );
      commissionTotal = (commissionData || []).reduce(
        (sum: number, row: any) => sum + Number(row.commission_base || 0),
        0
      );
    } else if (userRole === "admin") {
      const { data: commissionTxs, error: commissionTxErr } = await supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", userId)
        .eq("type", "fee_admin")
        .eq("source_kind", "ticket_commission")
        .gte("created_at", periodStart.toISOString());

      if (commissionTxErr) {
        console.error("calculateUserActivity: transactions(admin commission) error", commissionTxErr);
      }

      commission = (commissionTxs || []).reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      );
      commissionTotal = null; // commissions_log doesn't track admin_id; requires org tree aggregation
    }

    // محاسبه واریز و برداشت از transactions
    const { data: depositsData, error: depositsError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("source_kind", "manual_panel")
      .gte("created_at", periodStart.toISOString());

    if (depositsError) {
      console.error("calculateUserActivity: deposits error", depositsError);
    }

    const { data: withdrawalsData, error: withdrawalsError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("type", "withdraw")
      .eq("source_kind", "manual_panel")
      .gte("created_at", periodStart.toISOString());

    if (withdrawalsError) {
      console.error("calculateUserActivity: withdrawals error", withdrawalsError);
    }

    const deposits = (depositsData || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    const withdrawals = (withdrawalsData || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    const net = deposits - withdrawals;

    return {
      period,
      gamesPlayed,
      lineWins,
      fullWins,
      commission,
      commissionTotal,
      deposits,
      withdrawals,
      net,
    };
  } catch (err) {
    console.error("calculateUserActivity unexpected error:", err);
    return {
      period,
      gamesPlayed: 0,
      lineWins: 0,
      fullWins: 0,
      commission: 0,
      commissionTotal: null,
      deposits: 0,
      withdrawals: 0,
      net: 0,
    };
  }
}

/**
 * بارگذاری تراکنش‌های کاربر
 */
async function loadUserTransactions(userId: string): Promise<UserAccountTransaction[]> {
  try {
    // گرفتن تراکنش‌های پنلی:
    // - مسیر قدیمی: manual_panel (deposit/withdraw)
    // - مسیر جدید: admin_panel_transfer (transfer_in/transfer_out)
    const { data: transactionsData, error: transactionsError } = await supabase
      .from("transactions")
      .select("id, user_id, amount, type, source_kind, source_ref, meta, created_at")
      .in("source_kind", ["manual_panel", "admin_panel_transfer"])
      .in("type", ["deposit", "withdraw", "transfer_in", "transfer_out"])
      .or(`user_id.eq.${userId},source_ref.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (transactionsError) {
      console.error("loadUserTransactions: transactions error", transactionsError);
      return [];
    }

    // گرفتن اطلاعات actor:
    // - manual_panel: source_ref
    // - admin_panel_transfer: meta.actor_id
    const actorIds = Array.from(
      new Set(
        (transactionsData || [])
          .map((t: any) =>
            t.source_kind === "admin_panel_transfer"
              ? (t.meta?.actor_id as string | null)
              : (t.source_ref as string | null)
          )
          .filter((id: string | null) => !!id)
      )
    ) as string[];

    if (actorIds.length === 0) {
      return [];
    }

    const { data: actorsData, error: actorsError } = await supabase
      .from("users")
      .select("id, username, role")
      .in("id", actorIds);

    if (actorsError) {
      console.error("loadUserTransactions: actors error", actorsError);
      return [];
    }

    const actorMap = new Map<string, { username: string; role: string }>();
    (actorsData || []).forEach((a: any) => {
      actorMap.set(a.id, {
        username: a.username || "نامشخص",
        role: a.role,
      });
    });

    // تبدیل به UserAccountTransaction
    const transactions: UserAccountTransaction[] = (transactionsData || [])
      .filter((t: any) => {
        const actorId =
          t.source_kind === "admin_panel_transfer"
            ? (t.meta?.actor_id as string | null)
            : (t.source_ref as string | null);
        return !!actorId && actorMap.has(actorId);
      })
      .map((t: any) => {
        const actorId =
          t.source_kind === "admin_panel_transfer"
            ? (t.meta?.actor_id as string | null)
            : (t.source_ref as string | null);
        const actor = actorMap.get(actorId as string)!;
        const mappedType: "deposit" | "withdraw" =
          t.type === "deposit" || t.type === "transfer_in" ? "deposit" : "withdraw";
        return {
          id: t.id,
          amount: Number(t.amount || 0),
          type: mappedType,
          actorRole: actor.role as "admin" | "agent" | "super",
          actorId: actorId as string,
          actorShortId: makeShortIdFromUuid(actorId as string),
          actorUsername: actor.username,
          createdAt: t.created_at,
        };
      });

    return transactions;
  } catch (err) {
    console.error("loadUserTransactions unexpected error:", err);
    return [];
  }
}

/**
 * بارگذاری یادداشت شخصی کاربر (یادداشتی که نویسنده فعلی نوشته است)
 */
async function loadPersonalNote(userId: string): Promise<string | null> {
  try {
    // گرفتن کاربر فعلی
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      return null;
    }

    // گرفتن یادداشت نویسنده فعلی برای این کاربر
    const { data: noteData, error: noteError } = await supabase
      .from("user_notes")
      .select("note")
      .eq("user_id", userId)
      .eq("author_id", currentUser.id)
      .single();

    if (noteError) {
      // اگر یادداشتی وجود نداشته باشد، خطا می‌دهد که طبیعی است
      if (noteError.code === "PGRST116") {
        return null; // یادداشتی وجود ندارد
      }
      console.error("loadPersonalNote: error", noteError);
      return null;
    }

    return noteData?.note || null;
  } catch (err) {
    console.error("loadPersonalNote unexpected error:", err);
    return null;
  }
}

/**
 * ذخیره یا به‌روزرسانی یادداشت شخصی
 */
export async function savePersonalNote(userId: string, note: string): Promise<boolean> {
  try {
    // اعتبارسنجی طول یادداشت
    if (note.length > 150) {
      console.error("savePersonalNote: note too long (max 150 characters)");
      return false;
    }

    // گرفتن کاربر فعلی
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      console.error("savePersonalNote: no current user");
      return false;
    }

    // استفاده از upsert برای ایجاد یا به‌روزرسانی
    const { error: upsertError } = await supabase
      .from("user_notes")
      .upsert(
        {
          user_id: userId,
          author_id: currentUser.id,
          note: note.trim(),
        },
        {
          onConflict: "user_id,author_id",
        }
      );

    if (upsertError) {
      console.error("savePersonalNote: upsert error", upsertError);
      return false;
    }

    return true;
  } catch (err) {
    console.error("savePersonalNote unexpected error:", err);
    return false;
  }
}

/**
 * حذف یادداشت شخصی
 */
export async function deletePersonalNote(userId: string): Promise<boolean> {
  try {
    // گرفتن کاربر فعلی
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      console.error("deletePersonalNote: no current user");
      return false;
    }

    const { error: deleteError } = await supabase
      .from("user_notes")
      .delete()
      .eq("user_id", userId)
      .eq("author_id", currentUser.id);

    if (deleteError) {
      console.error("deletePersonalNote: delete error", deleteError);
      return false;
    }

    return true;
  } catch (err) {
    console.error("deletePersonalNote unexpected error:", err);
    return false;
  }
}

/**
 * تعلیق یا فعال‌سازی اکانت کاربر
 * اگر suspended باشد، active می‌شود و برعکس
 * 
 * [MIGRATED_TO_ADMIN_API_PHASE_4] - این تابع اکنون از Admin API استفاده می‌کند
 */
export async function toggleUserSuspension(userId: string): Promise<{ success: boolean; newStatus: "active" | "suspended" | null; error?: string }> {
  try {
    // استفاده از Admin API به جای direct database access
    const { toggleUserSuspension: apiToggle } = await import('@/lib/adminApiClient');
    
    // گرفتن وضعیت فعلی کاربر برای برگرداندن newStatus
    const { data: userData, error: fetchError } = await supabase
      .from("users")
      .select("status")
      .eq("id", userId)
      .single();

    if (fetchError || !userData) {
      console.error("toggleUserSuspension: fetch error", fetchError);
      return { success: false, newStatus: null, error: "خطا در دریافت اطلاعات کاربر" };
    }

    const currentStatus = userData.status as "active" | "suspended" | "deleted";
    const expectedNewStatus: "active" | "suspended" = currentStatus === "suspended" ? "active" : "suspended";

    // فراخوانی Admin API
    await apiToggle(userId);

    return { success: true, newStatus: expectedNewStatus };
  } catch (err: any) {
    console.error("toggleUserSuspension unexpected error:", err);
    
    // تبدیل AdminApiError به فرمت قدیمی
    if (err.code) {
      return { success: false, newStatus: null, error: err.message || "خطا در تغییر وضعیت کاربر" };
    }
    
    return { success: false, newStatus: null, error: "خطای غیرمنتظره" };
  }
}

/**
 * تغییر نقش کاربر با رعایت قوانین دسترسی
 * قوانین:
 * - Player می‌تواند به Agent، Super یا Admin تبدیل شود (فقط توسط Admin)
 * - Agent می‌تواند به Super تبدیل شود
 * - Super فقط می‌تواند Player را به Agent تبدیل کند
 * - فقط Admin می‌تواند نقش را به Super یا Admin تبدیل کند
 * - parent_id حفظ می‌شود (اگر کاربر قبلاً یک parent داشت)
 * 
 * [MIGRATED_TO_ADMIN_API_PHASE_4] - این تابع اکنون از Admin API استفاده می‌کند
 */
export async function changeUserRole(
  userId: string,
  newRole: "player" | "agent" | "super" | "admin",
  adminSubRole?: "manager" | "finance" | "support" | "room" | "dev_panel" | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // استفاده از Admin API به جای direct database access
    const { setUserRole } = await import('@/lib/adminApiClient');
    
    // فراخوانی Admin API
    await setUserRole(userId, newRole, adminSubRole);

    return { success: true };
  } catch (err: any) {
    console.error("changeUserRole unexpected error:", err);
    
    // تبدیل AdminApiError به فرمت قدیمی
    if (err.code) {
      return { success: false, error: err.message || "خطا در تغییر نقش کاربر" };
    }
    
    return { success: false, error: "خطای غیرمنتظره" };
  }
}

/**
 * ذخیره درصد کانیات برای agent یا super
 * @param userId - شناسه کاربر
 * @param commissionPercent - درصد کانیات (0-100)
 */
export async function saveUserCommission(
  userId: string,
  commissionPercent: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // اعتبارسنجی درصد (0-100)
    if (commissionPercent < 0 || commissionPercent > 100) {
      return { success: false, error: "درصد کانیات باید بین 0 تا 100 باشد" };
    }
    // [MIGRATED_TO_ADMIN_API] - do not write user_commissions from the browser (RLS).
    const { setUserCommissionPercent } = await import("@/lib/adminApiClient");
    await setUserCommissionPercent(userId, commissionPercent);
    return { success: true };
  } catch (err: any) {
    console.error("saveUserCommission unexpected error:", err);

    // Map AdminApiError
    if (err?.code) {
      return { success: false, error: err.message || "خطا در ذخیره درصد کانیات" };
    }

    return { success: false, error: "خطای غیرمنتظره" };
  }
}

/**
 * بارگذاری کامل اطلاعات حساب کاربر
 */
export async function loadUserAccountData(
  userId: string,
  params: LoadUserAccountDataParams = {}
): Promise<UserAccountData | null> {
  try {
    const { maxAgeMs = 30_000, force = false } = params;

    if (!force) {
      const cached = getCachedUserAccountData(userId, { maxAgeMs });
      if (cached) return cached;
    }

    const user = await loadUserAccountInfo(userId);
    if (!user) {
      primeUserAccountDataCache(userId, null);
      return null;
    }

    // Fetch "month" sources once and aggregate day/week/month locally.
    let activities: Record<UserAccountPeriod, UserAccountActivity>;
    try {
      const monthly = await loadMonthlyActivitySource(userId, user.role);
      activities = buildActivitiesFromMonthlySource(monthly, user.role);
    } catch (err) {
      console.error("loadUserAccountData: monthly aggregation failed, fallback to per-period", err);
      activities = {
        day: await calculateUserActivity(userId, "day", user.role),
        week: await calculateUserActivity(userId, "week", user.role),
        month: await calculateUserActivity(userId, "month", user.role),
      };
    }

    const transactions = await loadUserTransactions(userId);

    const result: UserAccountData = {
      user,
      activities,
      transactions,
    };
    primeUserAccountDataCache(userId, result);
    return result;
  } catch (err) {
    console.error("loadUserAccountData unexpected error:", err);
    return null;
  }
}

