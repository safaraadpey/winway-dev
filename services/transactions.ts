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
}

/**
 * بارگذاری تاریخچه تراکنش‌های دستی (manual_panel)
 */
export async function loadTransactionHistory(
  params: LoadTransactionHistoryParams = {}
): Promise<TransactionHistoryResult> {
  const { dateFilter = "month", search = "" } = params;

  try {
    // گرفتن کاربر فعلی
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      throw new Error("خطا در احراز هویت");
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

    // تعیین کاربران زیرمجموعه برای فیلتر
    let targetUserIds: string[] = [];
    if (currentUser.role === "admin") {
      // admin: همه کاربران
      const { data: allUsers } = await supabase
        .from("users")
        .select("id")
        .in("role", ["player", "agent", "super"]);
      targetUserIds = (allUsers || []).map((u: any) => u.id);
    } else if (currentUser.role === "super") {
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

    // اگر کاربر زیرمجموعه‌ای ندارد، لیست خالی برمی‌گردانیم
    if (targetUserIds.length === 0) {
      return { transactions: [], totalCount: 0 };
    }

    // گرفتن تراکنش‌های manual_panel
    // باید تراکنش‌هایی که فرستنده (source_ref) یا گیرنده (user_id) در targetUserIds است را بگیریم
    // اما Supabase query builder نمی‌تواند OR پیچیده را handle کند، پس باید از RPC استفاده کنیم
    // یا اینکه دو query جداگانه بگیریم و merge کنیم
    
    // روش 1: گرفتن تراکنش‌هایی که گیرنده در targetUserIds است
    const { data: transactionsAsReceiver, error: error1 } = await supabase
      .from("transactions")
      .select("id, user_id, amount, type, created_at, description, source_ref")
      .eq("source_kind", "manual_panel")
      .in("type", ["deposit", "withdraw"])
      .in("user_id", targetUserIds)
      .gte("created_at", dateFrom.toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    // روش 2: گرفتن تراکنش‌هایی که فرستنده (source_ref) در targetUserIds است
    // source_ref یک text است که UUID را به صورت string نگه می‌دارد
    // باید از filter استفاده کنیم چون .in() ممکن است با text درست کار نکند
    let senderQuery = supabase
      .from("transactions")
      .select("id, user_id, amount, type, created_at, description, source_ref")
      .eq("source_kind", "manual_panel")
      .in("type", ["deposit", "withdraw"])
      .gte("created_at", dateFrom.toISOString());
    
    // فیلتر source_ref: باید یکی از targetUserIds باشد
    // چون source_ref text است، باید به صورت دستی فیلتر کنیم
    const { data: transactionsAsSenderRaw, error: error2 } = await senderQuery;
    
    // فیلتر کردن در client-side
    const transactionsAsSender = (transactionsAsSenderRaw || []).filter((t: any) => 
      t.source_ref && targetUserIds.includes(t.source_ref)
    ).slice(0, 100);

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
    
    const transactions = uniqueTransactions.slice(0, 100); // limit to 100

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

    const allUserIds = Array.from(new Set([...actorIds, ...targetIds]));

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
    for (const t of transactions || []) {
      // تعیین actor و target بر اساس type تراکنش
      let actorId: string;
      let targetId: string;
      
      if (t.type === "deposit") {
        // در deposit: actor = source_ref (کسی که واریز می‌کند), target = user_id (کسی که دریافت می‌کند)
        actorId = t.source_ref || "";
        targetId = t.user_id;
      } else {
        // در withdraw: actor = user_id (کسی که برداشت می‌کند), target = source_ref (کسی که از او برداشت می‌شود)
        actorId = t.user_id;
        targetId = t.source_ref || "";
      }

      const actorUser = userMap.get(actorId);
      const targetUser = userMap.get(targetId);

      if (!actorUser || !targetUser) {
        continue;
      }

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
        type: t.type as TransactionAction,
        createdAt: t.created_at,
        description: t.description || undefined,
      });
    }

    return {
      transactions: historyItems,
      totalCount: historyItems.length,
    };
  } catch (err: any) {
    console.error("loadTransactionHistory error:", err);
    throw new Error(err?.message || "خطا در بارگذاری تاریخچه تراکنش‌ها");
  }
}


