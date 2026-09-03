// services/transactions.ts
//
// Service layer for manual deposit/withdraw actions from admin/agent/super panels.

import { supabase } from "@/lib/supabaseClient";
import {
  getOpenTehranAccountingWindow,
  getOpenTehranWeekAccountingWindow,
  getTehranInclusiveDateRangeIso,
} from "@/lib/dashboard/tehranAccountingWindow";
import type {
  BulkAdjustRequest,
  BulkMoneyResponse,
  BulkTransferRequest,
  TransactionAction,
  TransactionHistoryItem,
  TransactionHistoryResult,
  DateFilter,
} from "@/src/types/transactions";

function newIdempotencyIds(count: number): string[] {
  return Array.from({ length: count }, () => crypto.randomUUID());
}

/**
 * واریز/برداشت دستی موجودی کیف پول کاربران
 *
 * این تابع از API route سروری استفاده می‌کند (نه فراخوانی مستقیم RPC).
 * API route از supabaseServer (service role) استفاده می‌کند.
 * برای retry امن، همان idempotencyKeys را دوباره بفرستید.
 */
export async function adjustWalletForUsersBulk(
  req: BulkAdjustRequest
): Promise<BulkMoneyResponse> {
  const { userIds, amount, action, currency = "IRR", description } = req;

  if (!userIds || userIds.length === 0) {
    throw new Error("هیچ کاربری انتخاب نشده است");
  }

  if (!amount || amount <= 0) {
    throw new Error("مبلغ باید بزرگ‌تر از صفر باشد");
  }

  if (action !== "deposit" && action !== "withdraw") {
    throw new Error("نوع تراکنش نامعتبر است");
  }

  const idempotencyKeys =
    req.idempotencyKeys && req.idempotencyKeys.length === userIds.length
      ? req.idempotencyKeys
      : newIdempotencyIds(userIds.length);

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error("خطا در احراز هویت - لطفاً دوباره وارد شوید");
  }

  const response = await fetch("/api/admin/wallet/adjust", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      userIds,
      idempotencyKeys,
      amount,
      action,
      currency,
      description,
    }),
  });

  let result: any;
  try {
    result = await response.json();
  } catch (parseError) {
    console.error(
      "[adjustWalletForUsersBulk] Failed to parse response:",
      parseError
    );
    throw new Error(`خطا در ارتباط با سرور (کد: ${response.status})`);
  }

  if (!result?.results) {
    const errorMessage =
      result?.message ||
      result?.error ||
      `خطا در انجام تراکنش (کد: ${response.status})`;
    throw new Error(errorMessage);
  }

  if (!result.ok) {
    throw new Error(result.message || result.error || "خطا در انجام تراکنش");
  }

  return result as BulkMoneyResponse;
}

/**
 * انتقال دوطرفه (اتومیک) بین wallet های actor و پایین‌دستی (فقط IRR).
 *
 * این تابع فقط route جدید را صدا می‌زند و مسیر قدیمی adjust را دست نمی‌زند.
 */
export async function transferWalletForUsersBulk(
  req: BulkTransferRequest
): Promise<BulkMoneyResponse> {
  const { userIds, amount, action, currency = "IRR", description } = req;

  if (!userIds || userIds.length === 0) {
    throw new Error("هیچ کاربری انتخاب نشده است");
  }

  if (!amount || amount <= 0) {
    throw new Error("مبلغ باید بزرگ‌تر از صفر باشد");
  }

  if (!Number.isInteger(amount)) {
    throw new Error("مبلغ باید عدد صحیح باشد");
  }

  if (currency !== "IRR") {
    throw new Error("فقط IRR پشتیبانی می‌شود");
  }

  if (action !== "deposit" && action !== "withdraw") {
    throw new Error("نوع تراکنش نامعتبر است");
  }

  const clientRequestIds =
    req.clientRequestIds && req.clientRequestIds.length === userIds.length
      ? req.clientRequestIds
      : newIdempotencyIds(userIds.length);

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error("خطا در احراز هویت - لطفاً دوباره وارد شوید");
  }

  const response = await fetch("/api/admin/wallet/transfer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      userIds,
      clientRequestIds,
      amount,
      action,
      currency: "IRR",
      description,
    }),
  });

  let result: any;
  try {
    result = await response.json();
  } catch (parseError) {
    console.error(
      "[transferWalletForUsersBulk] Failed to parse response:",
      parseError
    );
    throw new Error(`خطا در ارتباط با سرور (کد: ${response.status})`);
  }

  if (!result?.results) {
    throw new Error(
      result?.message ||
        result?.error ||
        `خطا در انجام انتقال (کد: ${response.status})`
    );
  }

  if (!result.ok) {
    throw new Error(result.message || result.error || "خطا در انجام انتقال");
  }

  return result as BulkMoneyResponse;
}

// تبدیل UUID به ID ده‌رقمی
function makeShortIdFromUuid(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(31, hash) + id.charCodeAt(i);
  }
  const num = (hash >>> 0) % 1_000_000_0000; // 10^10
  return num.toString().padStart(10, "0");
}

export interface LoadTransactionHistoryParams {
  dateFilter?: DateFilter;
  rangeFrom?: string;
  rangeTo?: string;
  search?: string;
  maxAgeMs?: number;
  force?: boolean;
}

type TransactionHistoryCacheKey = string;
type TransactionHistoryCacheEntry = {
  key: TransactionHistoryCacheKey;
  fetchedAtMs: number;
  result: TransactionHistoryResult;
};

let transactionHistoryCache: TransactionHistoryCacheEntry | null = null;

export function clearTransactionHistoryCache() {
  transactionHistoryCache = null;
}

function makeHistoryCacheKey(params: {
  dateFilter: DateFilter;
  search: string;
  userId: string;
  rangeFrom?: string;
  rangeTo?: string;
}): string {
  const q = (params.search || "").trim().toLowerCase();
  const range =
    params.dateFilter === "range" ? `${params.rangeFrom || ""}|${params.rangeTo || ""}` : "";
  return `${params.userId}|${params.dateFilter}|${range}|${q}`;
}

function resolveTransactionHistoryWindow(
  dateFilter: DateFilter,
  rangeFrom?: string,
  rangeTo?: string
): { dateFromIso: string; dateToIso: string } {
  if (dateFilter === "day") {
    const { fromIso, toIso } = getOpenTehranAccountingWindow();
    return { dateFromIso: fromIso, dateToIso: toIso };
  }
  if (dateFilter === "week") {
    const { fromIso, toIso } = getOpenTehranWeekAccountingWindow();
    return { dateFromIso: fromIso, dateToIso: toIso };
  }
  if (!rangeFrom || !rangeTo || rangeFrom >= rangeTo) {
    throw new Error("بازه تاریخ نامعتبر است. پایان باید بعد از شروع باشد (مرز ۰۸:۰۰ تهران).");
  }
  const bounds = getTehranInclusiveDateRangeIso(rangeFrom, rangeTo);
  if (!bounds) {
    throw new Error("بازه تاریخ نامعتبر است. پایان باید بعد از شروع باشد (مرز ۰۸:۰۰ تهران).");
  }
  return { dateFromIso: bounds.fromIso, dateToIso: bounds.toIso };
}

/** PostgREST page size (project max-rows is typically 1000). */
const HISTORY_PAGE_SIZE = 1000;
/** Safety cap so a busy period cannot unbounded-load the browser. */
const HISTORY_MAX_ROWS = 10_000;
const IN_FILTER_CHUNK = 200;

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type HistoryPageQueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function fetchAllHistoryPages<T>(
  runPage: (from: number, to: number) => PromiseLike<HistoryPageQueryResult<T>>,
  logLabel: string
): Promise<{ rows: T[]; error: HistoryPageQueryResult<T>["error"]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < HISTORY_MAX_ROWS; from += HISTORY_PAGE_SIZE) {
    const to = from + HISTORY_PAGE_SIZE - 1;
    const { data, error } = await runPage(from, to);
    if (error) return { rows, error, truncated: false };
    const page = data || [];
    rows.push(...page);
    if (page.length < HISTORY_PAGE_SIZE) {
      return { rows, error: null, truncated: false };
    }
  }
  console.warn(`[Wallet] ${logLabel} truncated at ${HISTORY_MAX_ROWS} rows`);
  return { rows, error: null, truncated: true };
}

/** Panel cashdesk + approved withdrawal credits — excludes room join, settlement, commission, etc. */
const PANEL_HISTORY_SOURCE_KINDS = [
  "manual_panel",
  "admin_panel_transfer",
  "withdrawal_request",
] as const;

function isPanelCashdeskTransaction(row: {
  source_kind?: string | null;
  type?: string | null;
}): boolean {
  const kind = String(row.source_kind ?? "");
  const type = String(row.type ?? "");
  if (kind === "manual_panel") {
    return type === "deposit" || type === "withdraw";
  }
  if (kind === "admin_panel_transfer") {
    return type === "transfer_in" || type === "transfer_out";
  }
  // Only the approve credit leg (player → agent/admin), not hold/release.
  if (kind === "withdrawal_request") {
    return type === "transfer_in";
  }
  return false;
}

const HISTORY_GATEWAY_COUNTERPART = {
  userId: "system:gateway",
  username: "درگاه",
  shortId: "0000000001",
} as const;

const HISTORY_TETHER_COUNTERPART = {
  userId: "system:tether",
  username: "تتر",
  shortId: "0000000002",
} as const;

const HISTORY_TETHER_WITHDRAW_COUNTERPART = {
  userId: "system:tether-withdraw",
  username: "برداشت تتر",
  shortId: "0000000003",
} as const;

function classifyDepositHistoryType(
  idempotencyKey: string | null | undefined
): "gateway_deposit" | "crypto_deposit" {
  const key = String(idempotencyKey ?? "");
  if (key.startsWith("deposit:tron:")) {
    return "crypto_deposit";
  }
  return "gateway_deposit";
}

async function fetchUsernameMap(
  userIds: string[]
): Promise<
  Map<
    string,
    {
      username: string;
      shortId: string;
      role?: string;
      adminSubRole?: string | null;
    }
  >
> {
  const map = new Map<
    string,
    {
      username: string;
      shortId: string;
      role?: string;
      adminSubRole?: string | null;
    }
  >();
  const uniqueIds = Array.from(new Set(userIds.filter((id) => /^[0-9a-fA-F-]{36}$/.test(id))));
  if (uniqueIds.length === 0) return map;

  for (const batch of chunkArray(uniqueIds, IN_FILTER_CHUNK)) {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, role, admin_sub_role")
      .in("id", batch);

    if (error) {
      console.error("[Wallet] fetchUsernameMap error:", error);
      return map;
    }

    for (const row of data || []) {
      map.set(String(row.id), {
        username: row.username || "نامشخص",
        shortId: makeShortIdFromUuid(String(row.id)),
        role: row.role,
        adminSubRole: row.admin_sub_role ?? null,
      });
    }
  }

  return map;
}

function matchesHistorySearch(
  search: string,
  left: { username: string; shortId: string },
  right: { username: string; shortId: string }
): boolean {
  if (!search.trim()) return true;
  const q = search.trim().toLowerCase();
  return (
    left.username.toLowerCase().includes(q) ||
    right.username.toLowerCase().includes(q) ||
    left.shortId.includes(search.trim()) ||
    right.shortId.includes(search.trim())
  );
}

async function loadOnlineDepositHistoryItems(params: {
  scopeAll: boolean;
  targetUserIds: string[];
  dateFromIso: string;
  dateToIso: string;
  search: string;
}): Promise<TransactionHistoryItem[]> {
  const { scopeAll, targetUserIds, dateFromIso, dateToIso, search } = params;

  if (!scopeAll && targetUserIds.length === 0) {
    return [];
  }

  const { rows: data, error } = await fetchAllHistoryPages(
    (from, to) => {
      let query = supabase
        .from("transactions")
        .select("id, user_id, amount, created_at, idempotency_key")
        .eq("source_kind", "deposit_domain")
        .eq("type", "deposit")
        .gte("created_at", dateFromIso)
        .lte("created_at", dateToIso)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (!scopeAll) {
        query = query.in("user_id", targetUserIds);
      }
      return query;
    },
    "deposit_domain history"
  );
  if (error) {
    console.warn("[Wallet] deposit_domain history error:", error.message);
    return [];
  }

  const playerIds = (data || []).map((row: any) => String(row.user_id));
  const userMap = await fetchUsernameMap(playerIds);
  const items: TransactionHistoryItem[] = [];

  for (const row of data || []) {
    const txType = classifyDepositHistoryType(row.idempotency_key);
    const counterpart =
      txType === "crypto_deposit"
        ? HISTORY_TETHER_COUNTERPART
        : HISTORY_GATEWAY_COUNTERPART;
    const playerId = String(row.user_id);
    const player = userMap.get(playerId) || {
      username: "کاربر",
      shortId: makeShortIdFromUuid(playerId),
    };

    if (!matchesHistorySearch(search, counterpart, player)) {
      continue;
    }

    items.push({
      id: String(row.id),
      fromUserId: counterpart.userId,
      fromUsername: counterpart.username,
      fromShortId: counterpart.shortId,
      toUserId: playerId,
      toUsername: player.username,
      toShortId: player.shortId,
      amount: Number(row.amount) || 0,
      type: txType,
      createdAt: row.created_at,
    });
  }

  return items;
}

async function loadCryptoWithdrawalHistoryItems(params: {
  scopeAll: boolean;
  targetUserIds: string[];
  dateFromIso: string;
  dateToIso: string;
  search: string;
}): Promise<TransactionHistoryItem[]> {
  const { scopeAll, targetUserIds, dateFromIso, dateToIso, search } = params;

  if (!scopeAll && targetUserIds.length === 0) {
    return [];
  }

  const { rows: data, error } = await fetchAllHistoryPages(
    (from, to) => {
      let query = supabase
        .from("withdrawal_requests")
        .select("id, player_id, amount, created_at")
        .eq("kind", "crypto")
        .gte("created_at", dateFromIso)
        .lte("created_at", dateToIso)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (!scopeAll) {
        query = query.in("player_id", targetUserIds);
      }
      return query;
    },
    "crypto withdrawal history"
  );
  if (error) {
    console.warn("[Wallet] crypto withdrawal history error:", error.message);
    return [];
  }

  const playerIds = (data || []).map((row: any) => String(row.player_id));
  const userMap = await fetchUsernameMap(playerIds);
  const items: TransactionHistoryItem[] = [];

  for (const row of data || []) {
    const playerId = String(row.player_id);
    const player = userMap.get(playerId) || {
      username: "کاربر",
      shortId: makeShortIdFromUuid(playerId),
    };

    if (
      !matchesHistorySearch(search, HISTORY_TETHER_WITHDRAW_COUNTERPART, player)
    ) {
      continue;
    }

    items.push({
      id: `wr:${String(row.id)}`,
      fromUserId: HISTORY_TETHER_WITHDRAW_COUNTERPART.userId,
      fromUsername: HISTORY_TETHER_WITHDRAW_COUNTERPART.username,
      fromShortId: HISTORY_TETHER_WITHDRAW_COUNTERPART.shortId,
      toUserId: playerId,
      toUsername: player.username,
      toShortId: player.shortId,
      amount: Number(row.amount) || 0,
      type: "crypto_withdrawal",
      createdAt: row.created_at,
    });
  }

  return items;
}

/**
 * تاریخچه پیشخوان پنل: واریز/برداشت دستی، انتقال پنلی، و برداشت‌های تأییدشده (withdrawal_request).
 * تراکنش‌های بازی (room_join، settlement، کمیسیون و …) در این گزارش نیست.
 */
export async function loadTransactionHistory(
  params: LoadTransactionHistoryParams = {}
): Promise<TransactionHistoryResult> {
  const { dateFilter = "week", rangeFrom, rangeTo, search = "", maxAgeMs = 30_000, force = false } =
    params;

  try {
    // گرفتن کاربر فعلی
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      throw new Error("خطا در احراز هویت");
    }

    const cacheKey = makeHistoryCacheKey({
      userId: authUser.id,
      dateFilter,
      search,
      rangeFrom,
      rangeTo,
    });
    if (!force && transactionHistoryCache?.key === cacheKey) {
      const ageMs = Date.now() - transactionHistoryCache.fetchedAtMs;
      if (ageMs >= 0 && ageMs <= maxAgeMs) {
        return transactionHistoryCache.result;
      }
    }

    const { data: currentUser, error: userError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .single();

    if (userError || !currentUser) {
      throw new Error("خطا در دریافت اطلاعات کاربر");
    }

    const { dateFromIso, dateToIso } = resolveTransactionHistoryWindow(
      dateFilter,
      rangeFrom,
      rangeTo
    );

    console.info("[Wallet] transaction history window", {
      dateFilter,
      dateFromIso,
      dateToIso,
      source:
        dateFilter === "day"
          ? "tehran_08:00"
          : dateFilter === "week"
            ? "tehran_saturday_08:00"
            : "tehran_range",
    });

    const scopeAll = currentUser.role === "admin";

    // تعیین کاربران زیرمجموعه برای فیلتر (برای admin فیلتر لازم نیست)
    let targetUserIds: string[] = [];
    if (currentUser.role === "super") {
      // super: agents و players زیر این super
      // 1. گرفتن agents که parent_id آن‌ها این super است
      const { data: agentsData, error: agentsError } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", currentUser.id)
        .eq("role", "agent");

      if (agentsError) {
        console.error("loadTransactionHistory: agents for super error", agentsError);
      } else {
        const agentIds = (agentsData || []).map((a: any) => a.id);
        targetUserIds.push(...agentIds);

        // 2. گرفتن players مستقیم زیر این super (parent_id = super.id)
        const { data: directPlayersData, error: directPlayersError } = await supabase
          .from("users")
          .select("id")
          .eq("parent_id", currentUser.id)
          .eq("role", "player");

        if (directPlayersError) {
          console.error("loadTransactionHistory: direct players for super error", directPlayersError);
        } else {
          const directPlayerIds = (directPlayersData || []).map((p: any) => p.id);
          targetUserIds.push(...directPlayerIds);
        }

        // 3. گرفتن players که parent_id آن‌ها یکی از agents زیر این super است
        if (agentIds.length > 0) {
          const { data: playersData, error: playersError } = await supabase
            .from("users")
            .select("id")
            .in("parent_id", agentIds)
            .eq("role", "player");

          if (playersError) {
            console.error("loadTransactionHistory: players under agents for super error", playersError);
          } else {
            const playerIds = (playersData || []).map((p: any) => p.id);
            targetUserIds.push(...playerIds);
          }
        }

        // 4. همچنین از player_affiliation هم استفاده می‌کنیم (برای سازگاری)
        const { data: paRows, error: paError } = await supabase
          .from("player_affiliation")
          .select("user_id, agent_id")
          .eq("super_id", currentUser.id);

        if (!paError && paRows && paRows.length > 0) {
          const paPlayerIds = paRows.map((r: any) => r.user_id);
          const paAgentIds = paRows
            .map((r: any) => r.agent_id)
            .filter((id: string | null) => !!id);
          targetUserIds.push(...paPlayerIds, ...paAgentIds);
        }

        // حذف duplicates
        targetUserIds = Array.from(new Set(targetUserIds));
      }
    } else if (currentUser.role === "agent") {
      // agent: players زیر این agent
      // 1. گرفتن players مستقیم زیر این agent (parent_id = agent.id)
      const { data: directPlayersData, error: directPlayersError } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", currentUser.id)
        .eq("role", "player");

      if (directPlayersError) {
        console.error("loadTransactionHistory: direct players for agent error", directPlayersError);
      } else {
        const directPlayerIds = (directPlayersData || []).map((p: any) => p.id);
        targetUserIds.push(...directPlayerIds);
      }

      // 2. همچنین از player_affiliation هم استفاده می‌کنیم (برای سازگاری)
      const { data: paRows, error: paError } = await supabase
        .from("player_affiliation")
        .select("user_id")
        .eq("agent_id", currentUser.id);

      if (!paError && paRows && paRows.length > 0) {
        const paPlayerIds = paRows.map((r: any) => r.user_id);
        targetUserIds.push(...paPlayerIds);
      }

      // حذف duplicates
      targetUserIds = Array.from(new Set(targetUserIds));
    }

    // همیشه خود کاربر فعلی را هم اضافه کن تا تراکنش‌های خودش دیده شود
    if (!scopeAll && !targetUserIds.includes(currentUser.id)) {
      targetUserIds.push(currentUser.id);
    }

    // اگر کاربر زیرمجموعه‌ای ندارد، فقط تراکنش‌های خودش را داریم
    if (!scopeAll && targetUserIds.length === 0) {
      const empty: TransactionHistoryResult = { transactions: [], totalCount: 0 };
      transactionHistoryCache = {
        key: cacheKey,
        fetchedAtMs: Date.now(),
        result: empty,
      };
      return empty;
    }

    const panelSelect =
      "id, user_id, amount, type, created_at, description, source_kind, source_ref, meta";

    let uniqueTransactions: any[];

    let historyTruncated = false;

    if (scopeAll) {
      const { rows, error, truncated } = await fetchAllHistoryPages(
        (from, to) =>
          supabase
            .from("transactions")
            .select(panelSelect)
            .in("source_kind", [...PANEL_HISTORY_SOURCE_KINDS])
            .gte("created_at", dateFromIso)
            .lte("created_at", dateToIso)
            .order("created_at", { ascending: false })
            .range(from, to),
        "loadTransactionHistory panel"
      );

      if (error) {
        console.error("[Wallet] loadTransactionHistory query error:", error);
        throw new Error("خطا در بارگذاری تاریخچه تراکنش‌ها");
      }
      uniqueTransactions = rows;
      historyTruncated = truncated;
    } else {
      const [receiverRes, senderRes] = await Promise.all([
        fetchAllHistoryPages(
          (from, to) =>
            supabase
              .from("transactions")
              .select(panelSelect)
              .in("source_kind", [...PANEL_HISTORY_SOURCE_KINDS])
              .gte("created_at", dateFromIso)
              .lte("created_at", dateToIso)
              .order("created_at", { ascending: false })
              .in("user_id", targetUserIds)
              .range(from, to),
          "loadTransactionHistory panel receiver"
        ),
        fetchAllHistoryPages(
          (from, to) =>
            supabase
              .from("transactions")
              .select(panelSelect)
              .in("source_kind", [...PANEL_HISTORY_SOURCE_KINDS])
              .gte("created_at", dateFromIso)
              .lte("created_at", dateToIso)
              .order("created_at", { ascending: false })
              .in("source_ref", targetUserIds)
              .range(from, to),
          "loadTransactionHistory panel sender"
        ),
      ]);

      if (receiverRes.error || senderRes.error) {
        console.error(
          "[Wallet] loadTransactionHistory query error:",
          receiverRes.error || senderRes.error
        );
        throw new Error("خطا در بارگذاری تاریخچه تراکنش‌ها");
      }

      const allTransactions = [...receiverRes.rows, ...senderRes.rows];
      historyTruncated = receiverRes.truncated || senderRes.truncated;

      uniqueTransactions = Array.from(
        new Map(allTransactions.map((t: any) => [t.id, t])).values()
      );

      uniqueTransactions.sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    const panelTransactions = uniqueTransactions.filter((t: any) => isPanelCashdeskTransaction(t));

    const withdrawalRequestIds = Array.from(
      new Set(
        panelTransactions
          .filter((t: any) => t.source_kind === "withdrawal_request" && t.source_ref)
          .map((t: any) => String(t.source_ref))
      )
    );

    const withdrawalPlayerByRequestId = new Map<string, string>();
    if (withdrawalRequestIds.length > 0) {
      for (const batch of chunkArray(withdrawalRequestIds, IN_FILTER_CHUNK)) {
        const { data: wrRows, error: wrError } = await supabase
          .from("withdrawal_requests")
          .select("id, player_id")
          .in("id", batch);

        if (wrError) {
          console.error("[Wallet] loadTransactionHistory withdrawal_requests error:", wrError);
          break;
        }
        for (const row of wrRows || []) {
          if (row?.id && row?.player_id) {
            withdrawalPlayerByRequestId.set(String(row.id), String(row.player_id));
          }
        }
      }

      // Fallback: hold leg has the player as user_id when WR meta/row is unavailable.
      const missingIds = withdrawalRequestIds.filter(
        (id) => !withdrawalPlayerByRequestId.has(id)
      );
      if (missingIds.length > 0) {
        for (const batch of chunkArray(missingIds, IN_FILTER_CHUNK)) {
          const { data: holdRows, error: holdError } = await supabase
            .from("transactions")
            .select("source_ref, user_id")
            .eq("source_kind", "withdrawal_request")
            .eq("type", "join_hold")
            .in("source_ref", batch);

          if (holdError) {
            console.error("[Wallet] loadTransactionHistory withdrawal hold lookup error:", holdError);
            break;
          }
          for (const row of holdRows || []) {
            const ref = String(row?.source_ref || "");
            const playerId = String(row?.user_id || "");
            if (ref && playerId && !withdrawalPlayerByRequestId.has(ref)) {
              withdrawalPlayerByRequestId.set(ref, playerId);
            }
          }
        }
      }
    }
    
    const targetUserSet = new Set(targetUserIds);
    const filteredTransactions = panelTransactions.filter((t: any) => {
      if (!scopeAll) {
        if (t.source_kind === "withdrawal_request") {
          const playerId =
            String(t.meta?.player_id || "") ||
            withdrawalPlayerByRequestId.get(String(t.source_ref || "")) ||
            "";
          const receiverId = String(t.user_id || "");
          return (
            (playerId && targetUserSet.has(playerId)) ||
            (receiverId && targetUserSet.has(receiverId))
          );
        }

        if (t.source_kind === "admin_panel_transfer" && t.meta?.actor_id && t.meta?.target_id) {
          const actorId = String(t.meta.actor_id);
          const targetId = String(t.meta.target_id);
          const inScope =
            targetUserSet.has(t.user_id) ||
            targetUserSet.has(actorId) ||
            targetUserSet.has(targetId) ||
            (t.source_ref && targetUserSet.has(String(t.source_ref)));
          if (!inScope) return false;

          const actorInScope = targetUserSet.has(actorId);
          const targetInScope = targetUserSet.has(targetId);
          if (actorInScope && targetInScope && t.type === "transfer_in") {
            return false;
          }
          return true;
        }

        const inScope =
          targetUserSet.has(t.user_id) ||
          (t.source_ref && targetUserSet.has(String(t.source_ref)));
        return inScope;
      }

      return true;
    });

    const transferMap = new Map<string, any>();
    for (const t of filteredTransactions) {
      if (t.source_kind === "admin_panel_transfer") {
        const transferKey = String(t.meta?.transfer_id || t.source_ref || t.id);
        const existing = transferMap.get(transferKey);
        if (!existing) {
          transferMap.set(transferKey, t);
        } else if (existing.type !== "transfer_out" && t.type === "transfer_out") {
          transferMap.set(transferKey, t);
        }
      } else {
        transferMap.set(String(t.id), t);
      }
    }

    const transactions = Array.from(transferMap.values());

    // گرفتن اطلاعات کاربران (فرستنده و گیرنده)
    const actorIds = Array.from(
      new Set(
        (transactions || [])
          .map((t: any) => t.source_ref)
          .filter((id: string | null) => !!id)
      )
    ) as string[];
    const targetIds = Array.from(
      new Set((transactions || []).map((t: any) => t.user_id))
    );

    const metaActorIds = Array.from(
      new Set(
        (transactions || [])
          .map((t: any) => t.meta?.actor_id)
          .filter((id: string | null) => !!id)
      )
    ) as string[];
    const metaTargetIds = Array.from(
      new Set(
        (transactions || [])
          .map((t: any) => t.meta?.target_id)
          .filter((id: string | null) => !!id)
      )
    ) as string[];
    const withdrawalPlayerIds = Array.from(
      new Set(
        (transactions || [])
          .filter((t: any) => t.source_kind === "withdrawal_request")
          .map((t: any) => {
            const fromMeta = t.meta?.player_id ? String(t.meta.player_id) : "";
            if (fromMeta) return fromMeta;
            return withdrawalPlayerByRequestId.get(String(t.source_ref || "")) || "";
          })
          .filter((id: string) => !!id)
      )
    );

    const allUserIds = Array.from(
      new Set([
        ...actorIds,
        ...targetIds,
        ...metaActorIds,
        ...metaTargetIds,
        ...withdrawalPlayerIds,
      ])
    ).filter((id) => /^[0-9a-fA-F-]{36}$/.test(id));

    const userMap = await fetchUsernameMap(allUserIds);

    const actorRoleFields = (
      userId: string
    ): {
      actorRole?: "admin" | "agent" | "super" | "player";
      actorAdminSubRole?: string | null;
    } => {
      const info = userMap.get(userId);
      if (!info?.role) return {};
      const role = info.role as "admin" | "agent" | "super" | "player";
      return {
        actorRole: role,
        actorAdminSubRole: role === "admin" ? info.adminSubRole ?? null : undefined,
      };
    };

    // تبدیل به TransactionHistoryItem
    // همیشه پنل/سیستم در سمت چپ (fromUser) و پلیر در سمت راست (toUser)
    const historyItems: TransactionHistoryItem[] = [];
    const depositTypes = new Set(["deposit"]);
    const isUuid = (value?: string | null) =>
      !!value && /^[0-9a-fA-F-]{36}$/.test(value);

    const getRoleFallbackName = (description?: string | null): string | null => {
      const desc = (description || "").toLowerCase();
      if (desc.includes("by admin")) return "ادمین پنل";
      if (desc.includes("by super")) return "سوپر پنل";
      if (desc.includes("by agent")) return "ایجنت پنل";
      return null;
    };

    const buildFallbackUser = (
      userId: string,
      description?: string | null
    ): { username: string; shortId: string } => {
      const roleName = getRoleFallbackName(description);
      if (roleName) {
        return { username: roleName, shortId: "پنل" };
      }
      if (isUuid(userId)) {
        return { username: "کاربر", shortId: makeShortIdFromUuid(userId) };
      }
      return { username: "نامشخص", shortId: "-----" };
    };

    for (const t of transactions || []) {
      if (t.source_kind === "withdrawal_request") {
        const playerId =
          String(t.meta?.player_id || "") ||
          withdrawalPlayerByRequestId.get(String(t.source_ref || "")) ||
          "";
        const receiverId = String(t.user_id || "");
        if (!playerId || !receiverId) continue;

        const playerUser =
          userMap.get(playerId) || buildFallbackUser(playerId, t.description);
        const receiverUser =
          userMap.get(receiverId) || buildFallbackUser(receiverId, t.description);

        if (search) {
          const searchLower = search.toLowerCase();
          const matchesPlayer =
            playerUser.username.toLowerCase().includes(searchLower) ||
            playerUser.shortId.includes(search);
          const matchesReceiver =
            receiverUser.username.toLowerCase().includes(searchLower) ||
            receiverUser.shortId.includes(search);
          if (!matchesPlayer && !matchesReceiver) continue;
        }

        historyItems.push({
          id: t.id,
          fromUserId: receiverId,
          fromUsername: receiverUser.username,
          fromShortId: receiverUser.shortId,
          toUserId: playerId,
          toUsername: playerUser.username,
          toShortId: playerUser.shortId,
          amount: Number(t.amount) || 0,
          type: "withdrawal_request",
          createdAt: t.created_at,
          description: t.description || undefined,
          ...actorRoleFields(receiverId),
        });
        continue;
      }

      const displayAction: TransactionAction =
        t.source_kind === "admin_panel_transfer" &&
        (t.meta?.action === "deposit" || t.meta?.action === "withdraw")
          ? t.meta.action
          : t.type === "withdraw" || t.type === "transfer_out"
          ? "withdraw"
          : "deposit";

      // تعیین طرف چپ (پنل/سیستم) و راست (پلیر) — مستقل از جهت پول
      let panelSideId: string;
      let playerSideId: string;

      if (t.source_kind === "admin_panel_transfer" && t.meta?.actor_id && t.meta?.target_id) {
        // actor_id همیشه اپراتور پنل (admin/super/agent) است
        panelSideId = t.meta.actor_id;
        playerSideId = t.meta.target_id;
      } else if (depositTypes.has(displayAction)) {
        panelSideId = t.source_ref || "";
        playerSideId = t.user_id;
      } else {
        panelSideId = t.source_ref || "";
        playerSideId = t.user_id;
      }

      const panelUser =
        userMap.get(panelSideId) || buildFallbackUser(panelSideId, t.description);
      const playerUser =
        userMap.get(playerSideId) || buildFallbackUser(playerSideId, t.description);

      // فیلتر جستجو
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesPanel =
          panelUser.username.toLowerCase().includes(searchLower) ||
          panelUser.shortId.includes(search);
        const matchesPlayer =
          playerUser.username.toLowerCase().includes(searchLower) ||
          playerUser.shortId.includes(search);
        if (!matchesPanel && !matchesPlayer) {
          continue;
        }
      }

      historyItems.push({
        id: t.id,
        fromUserId: panelSideId,
        fromUsername: panelUser.username,
        fromShortId: panelUser.shortId,
        toUserId: playerSideId,
        toUsername: playerUser.username,
        toShortId: playerUser.shortId,
        amount: Number(t.amount) || 0,
        type: displayAction,
        createdAt: t.created_at,
        description: t.description || undefined,
        ...actorRoleFields(panelSideId),
      });
    }

    const [onlineDepositItems, cryptoWithdrawalItems] = await Promise.all([
      loadOnlineDepositHistoryItems({
        scopeAll,
        targetUserIds,
        dateFromIso,
        dateToIso,
        search,
      }),
      loadCryptoWithdrawalHistoryItems({
        scopeAll,
        targetUserIds,
        dateFromIso,
        dateToIso,
        search,
      }),
    ]);

    const mergedItems = [...historyItems, ...onlineDepositItems, ...cryptoWithdrawalItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (mergedItems.length > HISTORY_MAX_ROWS) {
      mergedItems.length = HISTORY_MAX_ROWS;
      historyTruncated = true;
    }

    console.info("[Wallet] transaction history loaded", {
      dateFilter,
      dateFrom: dateFromIso,
      dateTo: dateToIso,
      panelCount: historyItems.length,
      gatewayAndCryptoDepositCount: onlineDepositItems.length,
      cryptoWithdrawalCount: cryptoWithdrawalItems.length,
      totalCount: mergedItems.length,
      truncated: historyTruncated,
    });

    const result: TransactionHistoryResult = {
      transactions: mergedItems,
      totalCount: mergedItems.length,
    };

    transactionHistoryCache = {
      key: cacheKey,
      fetchedAtMs: Date.now(),
      result,
    };

    return result;
  } catch (err: any) {
    console.error("loadTransactionHistory error:", err);
    throw new Error(err?.message || "خطا در بارگذاری تاریخچه تراکنش‌ها");
  }
}


