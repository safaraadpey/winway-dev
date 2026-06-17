// services/transactions.ts
//
// Service layer for manual deposit/withdraw actions from admin/agent/super panels.

import { supabase } from "@/lib/supabaseClient";
import type {
  BulkAdjustRequest,
  BulkTransferRequest,
  TransactionAction,
  TransactionHistoryItem,
  TransactionHistoryResult,
  DateFilter,
} from "@/src/types/transactions";

/**
 * واریز/برداشت دستی موجودی کیف پول کاربران
 * 
 * این تابع از API route سروری استفاده می‌کند (نه فراخوانی مستقیم RPC).
 * API route از supabaseServer (service role) استفاده می‌کند.
 */
export async function adjustWalletForUsersBulk(req: BulkAdjustRequest): Promise<void> {
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

  // گرفتن session token برای ارسال به API route
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error("خطا در احراز هویت - لطفاً دوباره وارد شوید");
  }

  // فراخوانی API route
  const response = await fetch("/api/admin/wallet/adjust", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      userIds,
      amount,
      action,
      currency,
      description,
    }),
  });

  if (!response.ok) {
    let errorData: any
    try {
      errorData = await response.json()
    } catch (parseError) {
      console.error('[adjustWalletForUsersBulk] Failed to parse error response:', parseError)
      throw new Error(`خطا در ارتباط با سرور (کد: ${response.status})`)
    }
    
    console.error('[adjustWalletForUsersBulk] API error response:', errorData)
    
    // بررسی فرمت جدید { ok: false, error, message }
    if (errorData.ok === false) {
      const errorMessage = errorData.message || errorData.error || "خطا در انجام تراکنش"
      throw new Error(errorMessage)
    }
    
    // فرمت قدیمی { error }
    const errorMessage = errorData.error || errorData.message || `خطا در انجام تراکنش (کد: ${response.status})`
    throw new Error(errorMessage)
  }

  let result: any
  try {
    result = await response.json()
  } catch (parseError) {
    console.error('[adjustWalletForUsersBulk] Failed to parse success response:', parseError)
    throw new Error("خطا در خواندن پاسخ سرور")
  }
  
  console.log('[adjustWalletForUsersBulk] API success response:', result)
  
  // بررسی فرمت جدید { ok: true } یا فرمت قدیمی { success: true }
  if (result.ok === false || (result.success === false)) {
    const errorMessage = result.message || result.error || "خطا در انجام تراکنش"
    throw new Error(errorMessage)
  }
  
  // اگر ok: true یا success: true باشد، موفق است
  if (result.ok !== true && result.success !== true) {
    console.warn('[adjustWalletForUsersBulk] Unexpected response format:', result)
    // اگر هیچ خطایی نیست، احتمالاً موفق است
    // اما برای اطمینان، بررسی می‌کنیم
  }
}

/**
 * انتقال دوطرفه (اتومیک) بین wallet های actor و پایین‌دستی (فقط IRR).
 *
 * این تابع فقط route جدید را صدا می‌زند و مسیر قدیمی adjust را دست نمی‌زند.
 */
export async function transferWalletForUsersBulk(
  req: BulkTransferRequest
): Promise<void> {
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
      amount,
      action,
      currency: "IRR",
      description,
    }),
  });

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch (parseError) {
      console.error(
        "[transferWalletForUsersBulk] Failed to parse error response:",
        parseError
      );
      throw new Error(`خطا در ارتباط با سرور (کد: ${response.status})`);
    }

    console.error("[transferWalletForUsersBulk] API error response:", errorData);
    if (errorData.ok === false) {
      throw new Error(
        errorData.message || errorData.error || "خطا در انجام انتقال"
      );
    }
    throw new Error(
      errorData.error ||
        errorData.message ||
        `خطا در انجام انتقال (کد: ${response.status})`
    );
  }

  let result: any;
  try {
    result = await response.json();
  } catch (parseError) {
    console.error(
      "[transferWalletForUsersBulk] Failed to parse success response:",
      parseError
    );
    throw new Error("خطا در خواندن پاسخ سرور");
  }

  if (result.ok === false || result.success === false) {
    throw new Error(result.message || result.error || "خطا در انجام انتقال");
  }
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

/**
 * بارگذاری تاریخچه تراکنش‌های دستی (manual_panel)
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

    // گرفتن همه تراکنش‌ها
    // باید تراکنش‌هایی که فرستنده (source_ref) یا گیرنده (user_id) در targetUserIds است را بگیریم
    // اما Supabase query builder نمی‌تواند OR پیچیده را handle کند، پس باید از RPC استفاده کنیم
    // یا اینکه دو query جداگانه بگیریم و merge کنیم
    
    // روش 1: گرفتن تراکنش‌هایی که گیرنده در scope است
    let receiverQuery = supabase
      .from("transactions")
      .select("id, user_id, amount, type, created_at, description, source_kind, source_ref, meta")
      .gte("created_at", dateFrom.toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    if (!scopeAll) {
      receiverQuery = receiverQuery.in("user_id", targetUserIds);
    }

    const { data: transactionsAsReceiver, error: error1 } = await receiverQuery;

    // روش 2: گرفتن تراکنش‌هایی که فرستنده (source_ref) در scope است
    let senderQuery = supabase
      .from("transactions")
      .select("id, user_id, amount, type, created_at, description, source_kind, source_ref, meta")
      .gte("created_at", dateFrom.toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    if (!scopeAll) {
      // source_ref column is text; PostgREST supports IN on text.
      senderQuery = senderQuery.in("source_ref", targetUserIds);
    }

    let transactionsAsSender: any[] | null = [];
    let error2: any = null;
    if (!scopeAll) {
      const senderRes = await senderQuery;
      transactionsAsSender = senderRes.data;
      error2 = senderRes.error;
    }

    if (error1 || error2) {
      console.error("loadTransactionHistory query error:", error1 || error2);
      throw new Error("خطا در بارگذاری تاریخچه تراکنش‌ها");
    }

    // merge کردن و حذف duplicates
    const allTransactions = [
      ...(transactionsAsReceiver || []),
      ...(transactionsAsSender || [])
    ];
    
    // حذف duplicates بر اساس id
    const uniqueTransactions = Array.from(
      new Map(allTransactions.map((t: any) => [t.id, t])).values()
    );
    
    // sort بر اساس created_at
    uniqueTransactions.sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    const targetUserSet = new Set(targetUserIds);
    const filteredTransactions = uniqueTransactions.filter((t: any) => {
      if (t.source_kind === "admin_panel_transfer" && t.meta?.actor_id && t.meta?.target_id) {
        const actorInScope = targetUserSet.has(String(t.meta.actor_id));
        const targetInScope = targetUserSet.has(String(t.meta.target_id));
        if (actorInScope && targetInScope && t.type === "transfer_in") {
          // when both sides are in scope, keep only transfer_out to avoid duplicate rows
          return false;
        }
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

    const allUserIds = Array.from(
      new Set([...actorIds, ...targetIds, ...metaActorIds, ...metaTargetIds])
    );

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


