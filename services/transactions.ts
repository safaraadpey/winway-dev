// services/transactions.ts
//
// Service layer for manual deposit/withdraw actions from admin/agent/super panels.

import { supabase } from "@/lib/supabaseClient";
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

function makeHistoryCacheKey(params: { dateFilter: DateFilter; search: string; userId: string }): string {
  // normalize search to avoid missing cache hits for trivial whitespace differences
  const q = (params.search || "").trim().toLowerCase();
  return `${params.userId}|${params.dateFilter}|${q}`;
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

/**
 * تاریخچه پیشخوان پنل: واریز/برداشت دستی، انتقال پنلی، و برداشت‌های تأییدشده (withdrawal_request).
 * تراکنش‌های بازی (room_join، settlement، کمیسیون و …) در این گزارش نیست.
 */
export async function loadTransactionHistory(
  params: LoadTransactionHistoryParams = {}
): Promise<TransactionHistoryResult> {
  const { dateFilter = "month", search = "", maxAgeMs = 30_000, force = false } = params;

  try {
    // گرفتن کاربر فعلی
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      throw new Error("خطا در احراز هویت");
    }

    const cacheKey = makeHistoryCacheKey({ userId: authUser.id, dateFilter, search });
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

    // محاسبه محدوده تاریخ
    const now = new Date();
    let dateFrom: Date;
    if (dateFilter === "day") {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (dateFilter === "week") {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
      dateFrom = new Date(now.getFullYear(), now.getMonth(), diff);
    } else {
      // month
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    }

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

    const dateFromIso = dateFrom.toISOString();

    const panelSelect =
      "id, user_id, amount, type, created_at, description, source_kind, source_ref, meta";

    let uniqueTransactions: any[];

    if (scopeAll) {
      const { data, error } = await supabase
        .from("transactions")
        .select(panelSelect)
        .in("source_kind", [...PANEL_HISTORY_SOURCE_KINDS])
        .gte("created_at", dateFromIso)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("[Wallet] loadTransactionHistory query error:", error);
        throw new Error("خطا در بارگذاری تاریخچه تراکنش‌ها");
      }
      uniqueTransactions = data || [];
    } else {
      // روش 1: تراکنش‌هایی که user_id (طرف کیف پول) در scope است
      let receiverQuery = supabase
        .from("transactions")
        .select(panelSelect)
        .in("source_kind", [...PANEL_HISTORY_SOURCE_KINDS])
        .gte("created_at", dateFromIso)
        .order("created_at", { ascending: false })
        .limit(100)
        .in("user_id", targetUserIds);

      const { data: transactionsAsReceiver, error: error1 } = await receiverQuery;

      // روش 2: تراکنش‌هایی که source_ref (عامل پنل / طرف مقابل) در scope است
      let senderQuery = supabase
        .from("transactions")
        .select(panelSelect)
        .in("source_kind", [...PANEL_HISTORY_SOURCE_KINDS])
        .gte("created_at", dateFromIso)
        .order("created_at", { ascending: false })
        .limit(100)
        .in("source_ref", targetUserIds);

      const senderRes = await senderQuery;
      const transactionsAsSender = senderRes.data;
      const error2 = senderRes.error;

      if (error1 || error2) {
        console.error("[Wallet] loadTransactionHistory query error:", error1 || error2);
        throw new Error("خطا در بارگذاری تاریخچه تراکنش‌ها");
      }

      const allTransactions = [
        ...(transactionsAsReceiver || []),
        ...(transactionsAsSender || []),
      ];

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
      const { data: wrRows, error: wrError } = await supabase
        .from("withdrawal_requests")
        .select("id, player_id")
        .in("id", withdrawalRequestIds);

      if (wrError) {
        console.error("[Wallet] loadTransactionHistory withdrawal_requests error:", wrError);
      } else {
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
        const { data: holdRows, error: holdError } = await supabase
          .from("transactions")
          .select("source_ref, user_id")
          .eq("source_kind", "withdrawal_request")
          .eq("type", "join_hold")
          .in("source_ref", missingIds);

        if (holdError) {
          console.error("[Wallet] loadTransactionHistory withdrawal hold lookup error:", holdError);
        } else {
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

    const transactions = Array.from(transferMap.values()).slice(0, 100); // limit to 100

    if (!transactions || transactions.length === 0) {
      return { transactions: [], totalCount: 0 };
    }

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

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, username")
      .in("id", allUserIds);

    if (usersError) {
      console.error("loadTransactionHistory users error:", usersError);
      throw new Error("خطا در دریافت اطلاعات کاربران");
    }

    // ساخت map برای کاربران
    const userMap = new Map<string, { username: string; shortId: string }>();
    (users || []).forEach((u: any) => {
      userMap.set(u.id, {
        username: u.username || "نامشخص",
        shortId: makeShortIdFromUuid(u.id),
      });
    });

    // تبدیل به TransactionHistoryItem
    // همیشه actor (عامل) را در سمت چپ (fromUser) و target را در سمت راست (toUser) نمایش می‌دهیم
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
          fromUserId: playerId,
          fromUsername: playerUser.username,
          fromShortId: playerUser.shortId,
          toUserId: receiverId,
          toUsername: receiverUser.username,
          toShortId: receiverUser.shortId,
          amount: Number(t.amount) || 0,
          type: "withdrawal_request",
          createdAt: t.created_at,
          description: t.description || undefined,
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

      // تعیین actor و target بر اساس اکشن نهایی
      let actorId: string;
      let targetId: string;

      if (t.source_kind === "admin_panel_transfer" && t.meta?.actor_id && t.meta?.target_id) {
        if (depositTypes.has(displayAction)) {
          actorId = t.meta.actor_id;
          targetId = t.meta.target_id;
        } else {
          actorId = t.meta.target_id;
          targetId = t.meta.actor_id;
        }
      } else if (depositTypes.has(displayAction)) {
        // در deposit: actor = source_ref (کسی که واریز می‌کند), target = user_id (کسی که دریافت می‌کند)
        actorId = t.source_ref || "";
        targetId = t.user_id;
      } else {
        // در withdraw: actor = user_id (کسی که برداشت می‌کند), target = source_ref (کسی که از او برداشت می‌شود)
        actorId = t.user_id;
        targetId = t.source_ref || "";
      }

      const actorUser = userMap.get(actorId) || buildFallbackUser(actorId, t.description);
      const targetUser = userMap.get(targetId) || buildFallbackUser(targetId, t.description);

      // فیلتر جستجو
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesActor =
          actorUser.username.toLowerCase().includes(searchLower) ||
          actorUser.shortId.includes(search);
        const matchesTarget =
          targetUser.username.toLowerCase().includes(searchLower) ||
          targetUser.shortId.includes(search);
        if (!matchesActor && !matchesTarget) {
          continue;
        }
      }

      historyItems.push({
        id: t.id,
        fromUserId: actorId, // همیشه actor در سمت چپ
        fromUsername: actorUser.username,
        fromShortId: actorUser.shortId,
        toUserId: targetId, // همیشه target در سمت راست
        toUsername: targetUser.username,
        toShortId: targetUser.shortId,
        amount: Number(t.amount) || 0,
        type: displayAction,
        createdAt: t.created_at,
        description: t.description || undefined,
      });
    }

    const result: TransactionHistoryResult = {
      transactions: historyItems,
      totalCount: historyItems.length,
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


