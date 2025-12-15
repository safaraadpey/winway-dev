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

    // گرفتن درصد کانیات از user_commissions (فقط برای agent و super)
    let commissionPercent: number | null = null;
    if (user.role === "agent" || user.role === "super") {
      const { data: commissionData, error: commissionError } = await supabase
        .from("user_commissions")
        .select("agent_commission, super_commission")
        .eq("user_id", userId)
        .single();

      if (!commissionError && commissionData) {
        if (user.role === "agent") {
          commissionPercent = commissionData.agent_commission ? Number(commissionData.agent_commission) * 100 : null; // تبدیل به درصد
        } else if (user.role === "super") {
          commissionPercent = commissionData.super_commission ? Number(commissionData.super_commission) * 100 : null; // تبدیل به درصد
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

    // گرفتن nickname از user_profiles
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("nickname")
      .eq("user_id", userId)
      .single();

    const username = user.username || "نامشخص";
    // اولویت: nickname از user_profiles > username
    const displayName = profile?.nickname || username;

    return {
      id: user.id,
      shortId: makeShortIdFromUuid(user.id),
      username,
      displayName,
      role: user.role as UserAccountInfo["role"],
      adminSubRole: (user as any).admin_sub_role as AdminSubRole | null,
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
  period: UserAccountPeriod
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

    // محاسبه کمیسیون از commissions_log
    // برای player، کمیسیون‌هایی که player_id = userId است
    // کانبات = مجموع همه کمیسیون‌هایی که از ticket های این player ایجاد شده
    const { data: commissionData, error: commissionError } = await supabase
      .from("commissions_log")
      .select("agent_amount, super_amount, admin_amount")
      .eq("player_id", userId)
      .gte("created_at", periodStart.toISOString());

    if (commissionError) {
      console.error("calculateUserActivity: commissions_log error", commissionError);
    }

    // جمع کردن همه کمیسیون‌ها (برای player، همه کمیسیون‌هایی که به او تعلق دارد)
    const commission = (commissionData || []).reduce((sum: number, row: any) => {
      return (
        sum +
        Number(row.agent_amount || 0) +
        Number(row.super_amount || 0) +
        Number(row.admin_amount || 0)
      );
    }, 0);

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
      lineWins,
      fullWins,
      commission,
      deposits,
      withdrawals,
      net,
    };
  } catch (err) {
    console.error("calculateUserActivity unexpected error:", err);
    return {
      period,
      lineWins: 0,
      fullWins: 0,
      commission: 0,
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
    // گرفتن تراکنش‌های manual_panel که این کاربر گیرنده یا فرستنده است
    const { data: transactionsData, error: transactionsError } = await supabase
      .from("transactions")
      .select("id, amount, type, source_ref, created_at")
      .eq("source_kind", "manual_panel")
      .in("type", ["deposit", "withdraw"])
      .or(`user_id.eq.${userId},source_ref.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (transactionsError) {
      console.error("loadUserTransactions: transactions error", transactionsError);
      return [];
    }

    // گرفتن اطلاعات actor (source_ref)
    const actorIds = Array.from(
      new Set(
        (transactionsData || [])
          .map((t: any) => t.source_ref)
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
      .filter((t: any) => t.source_ref && actorMap.has(t.source_ref))
      .map((t: any) => {
        const actor = actorMap.get(t.source_ref)!;
        return {
          id: t.id,
          amount: Number(t.amount || 0),
          type: t.type as "deposit" | "withdraw",
          actorRole: actor.role as "admin" | "agent" | "super",
          actorId: t.source_ref,
          actorShortId: makeShortIdFromUuid(t.source_ref),
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
  adminSubRole?: "manager" | "finance" | "support" | "room" | null
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

    // گرفتن نقش کاربر
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      console.error("saveUserCommission: user error", userError);
      return { success: false, error: "خطا در دریافت اطلاعات کاربر" };
    }

    const role = userData.role as "admin" | "super" | "agent" | "player";

    // فقط برای agent و super مجاز است
    if (role !== "agent" && role !== "super") {
      return { success: false, error: "درصد کانیات فقط برای ایجنت و سوپر قابل تنظیم است" };
    }

    // تبدیل درصد به اعشار (0-1)
    const commissionDecimal = commissionPercent / 100;

    // ذخیره در user_commissions
    const updateData: any = {};
    if (role === "agent") {
      updateData.agent_commission = commissionDecimal;
    } else if (role === "super") {
      updateData.super_commission = commissionDecimal;
    }

    const { error: upsertError } = await supabase
      .from("user_commissions")
      .upsert(
        {
          user_id: userId,
          ...updateData,
        },
        {
          onConflict: "user_id",
        }
      );

    if (upsertError) {
      console.error("saveUserCommission: upsert error", upsertError);
      return { success: false, error: "خطا در ذخیره درصد کانیات" };
    }

    return { success: true };
  } catch (err) {
    console.error("saveUserCommission unexpected error:", err);
    return { success: false, error: "خطای غیرمنتظره" };
  }
}

/**
 * بارگذاری کامل اطلاعات حساب کاربر
 */
export async function loadUserAccountData(userId: string): Promise<UserAccountData | null> {
  try {
    const user = await loadUserAccountInfo(userId);
    if (!user) {
      return null;
    }

    // محاسبه آمار برای هر دوره
    const activities: Record<UserAccountPeriod, UserAccountActivity> = {
      day: await calculateUserActivity(userId, "day"),
      week: await calculateUserActivity(userId, "week"),
      month: await calculateUserActivity(userId, "month"),
    };

    // بارگذاری تراکنش‌ها
    const transactions = await loadUserTransactions(userId);

    return {
      user,
      activities,
      transactions,
    };
  } catch (err) {
    console.error("loadUserAccountData unexpected error:", err);
    return null;
  }
}

