// services/user-account.ts
//
// Service helpers for user account detail page (admin / agent / super).

import { supabase } from "@/lib/supabaseClient";
import {
  getRollingWeekStart,
  getRollingMonthStart,
  loadCommissionDailyStatRows,
  loadCommissionDailyTotals,
  sumCommissionDailyRows,
  type CommissionDailyStatRow,
  type CommissionDailyTotals,
} from "@/lib/dashboard/loadCommissionDailyStats";
import {
  emptyCommissionTotals,
  loadOperatorCommissionSummaryRange,
  loadOperatorPeriodCommissionSummary,
  type OperatorPeriodCommissionMap,
} from "@/lib/dashboard/loadOperatorCommissionSummary";
import type { AdminSubRole } from "@/lib/auth-helpers";
import type {
  UserAccountData,
  UserAccountActivityMetrics,
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
function getPeriodStart(period: UserAccountPeriod): Date | null {
  if (period === "overall") return null;

  if (period === "week") {
    return getRollingWeekStart();
  }

  if (period === "month") {
    return getRollingMonthStart();
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (period === "day") {
    return now;
  }

  return null;
}

type PanelCashflowRow = {
  created_at: string;
  depositAmount: number;
  withdrawAmount: number;
};

async function loadPanelCashflowRows(
  userId: string,
  userRole: UserAccountInfo["role"],
  options?: { fromIso?: string; toIso?: string }
): Promise<PanelCashflowRow[]> {
  let manualQuery = supabase
    .from("transactions")
    .select("amount, type, created_at")
    .eq("source_kind", "manual_panel")
    .eq("source_ref", userId)
    .in("type", ["deposit", "withdraw"]);

  if (options?.fromIso) {
    manualQuery = manualQuery.gte("created_at", options.fromIso);
  }
  if (options?.toIso) {
    manualQuery = manualQuery.lte("created_at", options.toIso);
  }

  if (userRole === "player") {
    let transferInQuery = supabase
      .from("transactions")
      .select("amount, created_at")
      .eq("source_kind", "admin_panel_transfer")
      .eq("user_id", userId)
      .eq("type", "transfer_in")
      .filter("meta->>action", "eq", "deposit");
    let transferOutQuery = supabase
      .from("transactions")
      .select("amount, created_at")
      .eq("source_kind", "admin_panel_transfer")
      .eq("user_id", userId)
      .eq("type", "transfer_out")
      .filter("meta->>action", "eq", "withdraw");

    if (options?.fromIso) {
      transferInQuery = transferInQuery.gte("created_at", options.fromIso);
      transferOutQuery = transferOutQuery.gte("created_at", options.fromIso);
    }
    if (options?.toIso) {
      transferInQuery = transferInQuery.lte("created_at", options.toIso);
      transferOutQuery = transferOutQuery.lte("created_at", options.toIso);
    }

    const [manualRes, transferInRes, transferOutRes] = await Promise.all([
      manualQuery,
      transferInQuery,
      transferOutQuery,
    ]);

    if (manualRes.error) {
      console.error("[UserAccount] panel manual cashflow error", manualRes.error);
    }
    if (transferInRes.error) {
      console.error("[UserAccount] panel transfer_in cashflow error", transferInRes.error);
    }
    if (transferOutRes.error) {
      console.error("[UserAccount] panel transfer_out cashflow error", transferOutRes.error);
    }

    const rows: PanelCashflowRow[] = [];
    for (const row of manualRes.data || []) {
      rows.push({
        created_at: row.created_at,
        depositAmount: row.type === "deposit" ? Number(row.amount || 0) : 0,
        withdrawAmount: row.type === "withdraw" ? Number(row.amount || 0) : 0,
      });
    }
    for (const row of transferInRes.data || []) {
      rows.push({
        created_at: row.created_at,
        depositAmount: Number(row.amount || 0),
        withdrawAmount: 0,
      });
    }
    for (const row of transferOutRes.data || []) {
      rows.push({
        created_at: row.created_at,
        depositAmount: 0,
        withdrawAmount: Number(row.amount || 0),
      });
    }
    return rows;
  }

  let transferQuery = supabase
    .from("transactions")
    .select("amount, meta, created_at")
    .eq("source_kind", "admin_panel_transfer")
    .eq("type", "transfer_out")
    .filter("meta->>actor_id", "eq", userId);

  if (options?.fromIso) {
    transferQuery = transferQuery.gte("created_at", options.fromIso);
  }
  if (options?.toIso) {
    transferQuery = transferQuery.lte("created_at", options.toIso);
  }

  const [manualRes, transferRes] = await Promise.all([manualQuery, transferQuery]);

  if (manualRes.error) {
    console.error("[UserAccount] panel manual cashflow error", manualRes.error);
  }
  if (transferRes.error) {
    console.error("[UserAccount] panel transfer cashflow error", transferRes.error);
  }

  const rows: PanelCashflowRow[] = [];
  for (const row of manualRes.data || []) {
    rows.push({
      created_at: row.created_at,
      depositAmount: row.type === "deposit" ? Number(row.amount || 0) : 0,
      withdrawAmount: row.type === "withdraw" ? Number(row.amount || 0) : 0,
    });
  }
  for (const row of transferRes.data || []) {
    const action = String((row.meta as { action?: string } | null)?.action ?? "");
    const amount = Number(row.amount || 0);
    rows.push({
      created_at: row.created_at,
      depositAmount: action === "deposit" ? amount : 0,
      withdrawAmount: action === "withdraw" ? amount : 0,
    });
  }
  return rows;
}

function sumPanelCashflow(
  rows: PanelCashflowRow[],
  startMs: number | null
): { deposits: number; withdrawals: number; net: number } {
  let deposits = 0;
  let withdrawals = 0;
  for (const row of rows) {
    const ms = Date.parse(row.created_at);
    if (startMs !== null && ms < startMs) continue;
    deposits += row.depositAmount;
    withdrawals += row.withdrawAmount;
  }
  return { deposits, withdrawals, net: deposits - withdrawals };
}

function sumPanelCashflowAll(rows: PanelCashflowRow[]): {
  deposits: number;
  withdrawals: number;
  net: number;
} {
  return sumPanelCashflow(rows, null);
}

type TicketActivityRow = { room_id: string; created_at: string };

type MonthlyActivitySource =
  | {
      kind: "commissions_log";
      resultsRows: Array<{ win_type: string; created_at: string }>;
      commissionRows: Array<Record<string, any>>;
      panelCashflowRows: PanelCashflowRow[];
      ticketRows: TicketActivityRow[];
    }
  | {
      kind: "operator_commission";
      resultsRows: Array<{ win_type: string; created_at: string }>;
      commissionDailyRows: CommissionDailyStatRow[];
      periodTotals: OperatorPeriodCommissionMap;
      panelCashflowRows: PanelCashflowRow[];
      ticketRows: TicketActivityRow[];
    }
  | {
      kind: "admin_commission_tx";
      resultsRows: Array<{ win_type: string; created_at: string }>;
      commissionTxRows: Array<{ amount: any; created_at: string }>;
      panelCashflowRows: PanelCashflowRow[];
      ticketRows: TicketActivityRow[];
    };

async function loadMonthlyActivitySource(
  userId: string,
  userRole: UserAccountInfo["role"]
): Promise<MonthlyActivitySource> {
  const monthStart = getPeriodStart("month");
  const monthStartIso = monthStart ? monthStart.toISOString() : null;

  const resultsPromise = supabase
    .from("results")
    .select("win_type, created_at")
    .eq("user_id", userId)
    .gte("created_at", monthStartIso ?? "1970-01-01T00:00:00.000Z");

  const panelCashflowPromise = loadPanelCashflowRows(userId, userRole);

  const ticketsPromise =
    userRole === "player"
      ? supabase
          .from("tickets")
          .select("room_id, created_at")
          .eq("player_user_id", userId)
          .in("reservation_status", ["confirmed", "consumed"])
          .gte("created_at", monthStartIso ?? "1970-01-01T00:00:00.000Z")
      : Promise.resolve({ data: [] as TicketActivityRow[], error: null });

  if (userRole === "admin") {
    const adminCommissionPromise = supabase
      .from("transactions")
      .select("amount, created_at")
      .eq("user_id", userId)
      .eq("type", "fee_admin")
      .eq("source_kind", "ticket_commission")
      .gte("created_at", monthStartIso ?? "1970-01-01T00:00:00.000Z");

    const [resultsRes, panelCashflowRows, commRes, ticketsRes] = await Promise.all([
      resultsPromise,
      panelCashflowPromise,
      adminCommissionPromise,
      ticketsPromise,
    ]);

    if (resultsRes.error) {
      console.error("loadMonthlyActivitySource: results error", resultsRes.error);
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
      panelCashflowRows,
      commissionTxRows: (commRes.data || []) as any,
      ticketRows: (ticketsRes.data || []) as TicketActivityRow[],
    };
  }

  if (userRole === "agent" || userRole === "super") {
    const [resultsRes, panelCashflowRows, commissionDailyRows, periodTotals, ticketsRes] =
      await Promise.all([
        resultsPromise,
        panelCashflowPromise,
        loadCommissionDailyStatRows({
          supabase,
          userId,
          role: userRole,
        }),
        loadOperatorPeriodCommissionSummary({
          supabase,
          userId,
          role: userRole,
        }),
        ticketsPromise,
      ]);

    if (resultsRes.error) {
      console.error("loadMonthlyActivitySource: results error", resultsRes.error);
    }
    if (ticketsRes.error) {
      console.error("loadMonthlyActivitySource: tickets error", ticketsRes.error);
    }

    return {
      kind: "operator_commission",
      resultsRows: (resultsRes.data || []) as any,
      panelCashflowRows,
      commissionDailyRows,
      periodTotals,
      ticketRows: (ticketsRes.data || []) as TicketActivityRow[],
    };
  }

  // commissions_log (player)
  const commissionsQuery = supabase
    .from("commissions_log")
    .select("agent_amount, super_amount, admin_amount, commission_base, created_at")
    .eq("player_id", userId)
    .eq("status", "settled")
    .gte("created_at", monthStartIso ?? "1970-01-01T00:00:00.000Z");

  const [resultsRes, panelCashflowRows, commRes, ticketsRes] = await Promise.all([
    resultsPromise,
    panelCashflowPromise,
    commissionsQuery,
    ticketsPromise,
  ]);

  if (resultsRes.error) {
    console.error("loadMonthlyActivitySource: results error", resultsRes.error);
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
    panelCashflowRows,
    commissionRows: (commRes.data || []) as any,
    ticketRows: (ticketsRes.data || []) as TicketActivityRow[],
  };
}

function buildActivitiesFromMonthlySource(
  source: MonthlyActivitySource,
  userRole: UserAccountInfo["role"]
): Record<UserAccountPeriod, UserAccountActivity> {
  const dayStartMs = getPeriodStart("day")?.getTime() ?? 0;
  const weekStartMs = getPeriodStart("week")?.getTime() ?? 0;
  const monthStartMs = getPeriodStart("month")?.getTime() ?? 0;

  const results = (source.resultsRows || []).map((r) => ({
    ms: Date.parse(r.created_at),
    winType: r.win_type,
  }));

  const tickets = (source.ticketRows || []).map((t) => ({
    ms: Date.parse(t.created_at),
    roomId: t.room_id,
  }));

  const getGamesPlayed = (startMs: number | null) => {
    const rooms = new Set<string>();
    for (const t of tickets) {
      if (startMs !== null && t.ms < startMs) continue;
      if (t.roomId) rooms.add(t.roomId);
    }
    return rooms.size;
  };

  const getLineFullWins = (startMs: number | null) => {
    let lineWins = 0;
    let fullWins = 0;
    for (const r of results) {
      if (startMs !== null && r.ms < startMs) continue;
      if (r.winType === "line") lineWins += 1;
      else if (r.winType === "full") fullWins += 1;
    }
    return { lineWins, fullWins };
  };

  const getDepositsWithdrawals = (startMs: number | null) =>
    sumPanelCashflow(source.panelCashflowRows || [], startMs);

  const getCommission = (period: UserAccountPeriod, startMs: number | null) => {
    let commission = 0;
    let commissionTotal: number | null = null;

    if (userRole === "admin" && source.kind === "admin_commission_tx") {
      commission = (source.commissionTxRows || []).reduce((sum, row) => {
        const ms = Date.parse(row.created_at);
        if (startMs !== null && ms < startMs) return sum;
        return sum + Number(row.amount || 0);
      }, 0);
      commissionTotal = null;
      return { commission, commissionTotal };
    }

    if (source.kind === "operator_commission") {
      if (period === "overall") {
        const totals = sumCommissionDailyRows(source.commissionDailyRows);
        return {
          commission: totals.earnedAmount,
          commissionTotal: totals.commissionBase,
        };
      }
      const totals = source.periodTotals[period];
      return {
        commission: totals.earnedAmount,
        commissionTotal: totals.commissionBase,
      };
    }

    if (source.kind !== "commissions_log") {
      return { commission: 0, commissionTotal: null };
    }

    commissionTotal = 0;
    for (const row of source.commissionRows || []) {
      const ms = Date.parse(String((row as any).created_at));
      if (startMs !== null && ms < startMs) continue;

      commission +=
        Number((row as any).agent_amount || 0) +
        Number((row as any).super_amount || 0) +
        Number((row as any).admin_amount || 0);
      commissionTotal += Number((row as any).commission_base || 0);
    }

    return { commission, commissionTotal };
  };

  const buildOne = (period: UserAccountPeriod, startMs: number | null): UserAccountActivity => {
    const gamesPlayed = getGamesPlayed(startMs);
    const { lineWins, fullWins } = getLineFullWins(startMs);
    const { deposits, withdrawals, net } = getDepositsWithdrawals(startMs);
    const { commission, commissionTotal } = getCommission(period, startMs);
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
    overall: buildOne("overall", null),
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

async function sumSubordinateWalletAssets(subordinateIds: string[]): Promise<number> {
  if (subordinateIds.length === 0) {
    return 0;
  }

  let tomanBalance = 0;

  for (let i = 0; i < subordinateIds.length; i += SUBORDINATE_IDS_CHUNK_SIZE) {
    const chunk = subordinateIds.slice(i, i + SUBORDINATE_IDS_CHUNK_SIZE);

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

  return tomanBalance;
}

async function loadSubordinateAssets(
  userId: string,
  role: UserAccountInfo["role"]
): Promise<UserAccountInfo["subordinateAssets"]> {
  if (role !== "super" && role !== "agent") {
    return null;
  }

  const subordinateIds = await getSubordinateUserIdsForAssets(userId, role);
  const tomanBalance = await sumSubordinateWalletAssets(subordinateIds);

  console.info("[UserAccount] subordinate assets loaded", {
    userId,
    role,
    memberCount: subordinateIds.length,
    tomanBalance,
  });

  return { tomanBalance };
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
    const periodStartIso = periodStart?.toISOString() ?? null;

    let resultsQuery = supabase.from("results").select("win_type").eq("user_id", userId);
    if (periodStartIso) {
      resultsQuery = resultsQuery.gte("created_at", periodStartIso);
    }
    const { data: resultsData, error: resultsError } = await resultsQuery;

    if (resultsError) {
      console.error("calculateUserActivity: results error", resultsError);
    }

    const lineWins = (resultsData || []).filter((r: any) => r.win_type === "line").length;
    const fullWins = (resultsData || []).filter((r: any) => r.win_type === "full").length;

    // تعداد بازی = اتاق‌های متمایزی که پلیر تیکت معتبر خریده
    let gamesPlayed = 0;
    if (userRole === "player") {
      let ticketsQuery = supabase
        .from("tickets")
        .select("room_id")
        .eq("player_user_id", userId)
        .in("reservation_status", ["confirmed", "consumed"]);
      if (periodStartIso) {
        ticketsQuery = ticketsQuery.gte("created_at", periodStartIso);
      }
      const { data: ticketsData, error: ticketsError } = await ticketsQuery;

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
      let commissionQuery = supabase
        .from("commissions_log")
        .select("agent_amount, super_amount, admin_amount, commission_base")
        .eq("player_id", userId)
        .eq("status", "settled");
      if (periodStartIso) {
        commissionQuery = commissionQuery.gte("created_at", periodStartIso);
      }
      const { data: commissionData, error: commissionError } = await commissionQuery;

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
    } else if (userRole === "agent" || userRole === "super") {
      let totals: CommissionDailyTotals;
      if (period === "overall") {
        totals = await loadCommissionDailyTotals({
          supabase,
          userId,
          role: userRole,
        });
      } else if (periodStartIso) {
        const toIso = new Date().toISOString();
        totals = await loadOperatorCommissionSummaryRange({
          supabase,
          userId,
          role: userRole,
          fromIso: periodStartIso,
          toIso,
        });
      } else {
        totals = emptyCommissionTotals();
      }
      commission = totals.earnedAmount;
      commissionTotal = totals.commissionBase;
    } else if (userRole === "admin") {
      let commissionTxQuery = supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", userId)
        .eq("type", "fee_admin")
        .eq("source_kind", "ticket_commission");
      if (periodStartIso) {
        commissionTxQuery = commissionTxQuery.gte("created_at", periodStartIso);
      }
      const { data: commissionTxs, error: commissionTxErr } = await commissionTxQuery;

      if (commissionTxErr) {
        console.error("calculateUserActivity: transactions(admin commission) error", commissionTxErr);
      }

      commission = (commissionTxs || []).reduce(
        (sum: number, t: any) => sum + Number(t.amount || 0),
        0
      );
      commissionTotal = null; // commissions_log doesn't track admin_id; requires org tree aggregation
    }

    // محاسبه واریز و برداشت پنلی (manual_panel + admin_panel_transfer)
    const panelCashflowRows = await loadPanelCashflowRows(userId, userRole, {
      fromIso: periodStartIso ?? undefined,
    });
    const { deposits, withdrawals, net } = sumPanelCashflowAll(panelCashflowRows);

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
 * بارگذاری تراکنش‌های پنلی (واریز/برداشت دستی و انتقال پنلی)
 */
async function loadPanelUserTransactions(userId: string): Promise<UserAccountTransaction[]> {
  const { data: transactionsData, error: transactionsError } = await supabase
    .from("transactions")
    .select("id, user_id, amount, type, source_kind, source_ref, meta, created_at")
    .in("source_kind", ["manual_panel", "admin_panel_transfer"])
    .in("type", ["deposit", "withdraw", "transfer_in", "transfer_out"])
    .or(`user_id.eq.${userId},source_ref.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (transactionsError) {
    console.error("[UserAccount] panel transactions error", transactionsError);
    return [];
  }

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
    console.error("[UserAccount] panel transaction actors error", actorsError);
    return [];
  }

  const actorMap = new Map<string, { username: string; role: string }>();
  (actorsData || []).forEach((a: any) => {
    actorMap.set(a.id, {
      username: a.username || "نامشخص",
      role: a.role,
    });
  });

  return (transactionsData || [])
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
        category: "panel" as const,
        title: mappedType === "deposit" ? "واریز پنل" : "برداشت پنل",
        actorRole: actor.role as "admin" | "agent" | "super",
        actorId: actorId as string,
        actorShortId: makeShortIdFromUuid(actorId as string),
        actorUsername: actor.username,
        createdAt: t.created_at,
      };
    });
}

function classifyDepositDomainTitle(idempotencyKey: string | null | undefined): {
  category: "gateway_deposit" | "crypto_deposit";
  title: string;
} {
  const key = String(idempotencyKey ?? "");
  if (key.startsWith("deposit:tron:")) {
    return { category: "crypto_deposit", title: "خرید تتری" };
  }
  if (key.startsWith("deposit:fiat:")) {
    return { category: "gateway_deposit", title: "خرید درگاه" };
  }
  return { category: "gateway_deposit", title: "خرید درگاه" };
}

/**
 * بارگذاری واریزهای درگاه / تتری (deposit_domain)
 */
async function loadDepositDomainUserTransactions(
  userId: string
): Promise<UserAccountTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, amount, type, created_at, idempotency_key")
    .eq("user_id", userId)
    .eq("source_kind", "deposit_domain")
    .eq("type", "deposit")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("[UserAccount] deposit_domain transactions error", error.message);
    return [];
  }

  return (data || []).map((row: any) => {
    const { category, title } = classifyDepositDomainTitle(row.idempotency_key);
    return {
      id: row.id,
      amount: Number(row.amount || 0),
      type: "deposit" as const,
      category,
      title,
      createdAt: row.created_at,
    };
  });
}

/**
 * بارگذاری درخواست‌های برداشت پلیر (ریالی / تتری)
 */
async function loadWithdrawalUserTransactions(
  userId: string
): Promise<UserAccountTransaction[]> {
  const { data, error } = await supabase
    .from("withdrawal_requests")
    .select("id, amount, kind, created_at, crypto_symbol, network")
    .eq("player_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("[UserAccount] withdrawal_requests error", error.message);
    return [];
  }

  return (data || []).map((row: any) => {
    const isCrypto = row.kind === "crypto";
    const symbol = String(row.crypto_symbol || "USDT").toUpperCase();
    const network = String(row.network || "").toUpperCase();
    const title = isCrypto
      ? network
        ? `برداشت ${symbol} (${network})`
        : `برداشت ${symbol}`
      : "برداشت";

    return {
      id: String(row.id),
      amount: Number(row.amount || 0),
      type: "withdraw" as const,
      category: "withdrawal" as const,
      title,
      createdAt: row.created_at,
    };
  });
}

/**
 * بارگذاری تراکنش‌های کاربر
 */
async function loadUserTransactions(userId: string): Promise<UserAccountTransaction[]> {
  try {
    const [panelTransactions, depositTransactions, withdrawalTransactions] =
      await Promise.all([
        loadPanelUserTransactions(userId),
        loadDepositDomainUserTransactions(userId),
        loadWithdrawalUserTransactions(userId),
      ]);

    const merged = [
      ...panelTransactions,
      ...depositTransactions,
      ...withdrawalTransactions,
    ].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    console.info("[UserAccount] transactions loaded", {
      userId,
      panelCount: panelTransactions.length,
      depositCount: depositTransactions.length,
      withdrawalCount: withdrawalTransactions.length,
      totalCount: merged.length,
    });

    return merged.slice(0, 50);
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

function parseUtcDateRange(params: { from: string; to: string }): {
  fromIso: string;
  toIso: string;
  fromDate: string;
  toDate: string;
} {
  const from = new Date(`${params.from}T00:00:00.000Z`);
  const to = new Date(`${params.to}T23:59:59.999Z`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
    throw new Error("بازه تاریخ نامعتبر است");
  }
  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    fromDate: params.from,
    toDate: params.to,
  };
}

export async function loadUserAccountRangeActivity(
  userId: string,
  userRole: UserAccountInfo["role"],
  params: { from: string; to: string }
): Promise<UserAccountActivityMetrics> {
  const { fromIso, toIso, fromDate, toDate } = parseUtcDateRange(params);

  const resultsPromise = supabase
    .from("results")
    .select("win_type")
    .eq("user_id", userId)
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  const ticketsPromise =
    userRole === "player"
      ? supabase
          .from("tickets")
          .select("room_id")
          .eq("player_user_id", userId)
          .in("reservation_status", ["confirmed", "consumed"])
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
      : Promise.resolve({ data: [] as { room_id: string }[], error: null });

  const panelCashflowPromise = loadPanelCashflowRows(userId, userRole, {
    fromIso,
    toIso,
  });

  const [resultsRes, ticketsRes, panelCashflowRows] = await Promise.all([
    resultsPromise,
    ticketsPromise,
    panelCashflowPromise,
  ]);

  let commission = 0;
  let commissionTotal: number | null = null;
  if (userRole === "player") {
    const { data, error } = await supabase
      .from("commissions_log")
      .select("agent_amount, super_amount, admin_amount, commission_base")
      .eq("player_id", userId)
      .eq("status", "settled")
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    if (error) {
      console.error("[UserAccount] range commissions_log(player) error", error);
    }
    const rows = data || [];
    commission = rows.reduce(
      (sum, row) =>
        sum +
        Number(row.agent_amount || 0) +
        Number(row.super_amount || 0) +
        Number(row.admin_amount || 0),
      0
    );
    commissionTotal = rows.reduce(
      (sum, row) => sum + Number(row.commission_base || 0),
      0
    );
  } else if (userRole === "agent" || userRole === "super") {
    const totals = await loadOperatorCommissionSummaryRange({
      supabase,
      userId,
      role: userRole,
      fromIso,
      toIso,
    });
    commission = totals.earnedAmount;
    commissionTotal = totals.commissionBase;
  } else {
    const { data, error } = await supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("type", "fee_admin")
      .eq("source_kind", "ticket_commission")
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    if (error) {
      console.error("[UserAccount] range transactions(admin commission) error", error);
    }
    commission = (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    commissionTotal = null;
  }

  if (resultsRes.error) {
    console.error("[UserAccount] range results error", resultsRes.error);
  }
  if (ticketsRes.error) {
    console.error("[UserAccount] range tickets error", ticketsRes.error);
  }

  const { deposits, withdrawals, net } = sumPanelCashflowAll(panelCashflowRows);
  const lineWins = (resultsRes.data || []).filter((r) => r.win_type === "line").length;
  const fullWins = (resultsRes.data || []).filter((r) => r.win_type === "full").length;
  const gamesPlayed =
    userRole === "player"
      ? new Set(
          (ticketsRes.data || [])
            .map((t) => t.room_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        ).size
      : 0;

  return {
    gamesPlayed,
    lineWins,
    fullWins,
    commission,
    commissionTotal,
    deposits,
    withdrawals,
    net,
  };
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
        overall: await calculateUserActivity(userId, "overall", user.role),
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

