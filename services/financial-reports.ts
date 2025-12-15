// services/financial-reports.ts
//
// Service for loading financial reports for players

import { supabase } from "@/lib/supabaseClient";
import type {
  FinancialReportsData,
  FinancialSummary,
  FinancialTransaction,
  GameStatistics,
  ReportPeriod,
} from "@/src/types/financial-reports";

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
 * محاسبه محدوده تاریخ برای یک دوره
 */
function getPeriodDateRange(period: ReportPeriod): { from: Date; to: Date } {
  const now = new Date();
  let from: Date;
  
  if (period === "day") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === "week") {
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
    from = new Date(now.getFullYear(), now.getMonth(), diff);
  } else {
    // month
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  
  const to = new Date(now);
  return { from, to };
}

/**
 * بارگذاری گزارشات مالی برای پلیر
 */
export async function loadFinancialReports(
  period: ReportPeriod = "month"
): Promise<FinancialReportsData> {
  try {
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

    // فقط برای player
    if (currentUser.role !== "player") {
      throw new Error("این صفحه فقط برای پلیرها در دسترس است");
    }

    const { from, to } = getPeriodDateRange(period);

    // گرفتن تراکنش‌های manual_panel که player در آن‌ها receiver یا sender است
    // تراکنش‌هایی که source_kind = 'manual_panel' و user_id = player.id (receiver)
    const { data: transactionsAsReceiver, error: receiverError } = await supabase
      .from("transactions")
      .select(
        `
        id,
        amount,
        type,
        status,
        description,
        created_at,
        source_ref,
        user_id
      `
      )
      .eq("user_id", currentUser.id) // player به عنوان receiver
      .eq("source_kind", "manual_panel")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false });

    if (receiverError) {
      console.error("Error loading transactions as receiver:", receiverError);
    }

    // گرفتن تراکنش‌هایی که player به عنوان sender است (از wallet admin/agent)
    // این تراکنش‌ها در source_ref ذخیره می‌شوند
    const { data: transactionsAsSender, error: senderError } = await supabase
      .from("transactions")
      .select(
        `
        id,
        amount,
        type,
        status,
        description,
        created_at,
        source_ref,
        user_id
      `
      )
      .eq("source_ref", currentUser.id) // player به عنوان sender (در source_ref)
      .eq("source_kind", "manual_panel")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false });

    if (senderError) {
      console.error("Error loading transactions as sender:", senderError);
    }

    // جمع‌آوری IDهای actorها برای query یکجا
    const actorIds = new Set<string>();
    if (transactionsAsReceiver) {
      transactionsAsReceiver.forEach((tx) => {
        if (tx.source_ref) actorIds.add(tx.source_ref);
      });
    }
    if (transactionsAsSender) {
      transactionsAsSender.forEach((tx) => {
        if (tx.user_id) actorIds.add(tx.user_id);
      });
    }

    // گرفتن اطلاعات همه actorها در یک query
    const actorMap = new Map<string, { name: string; shortId: string; role: "admin" | "agent" | "super" }>();
    if (actorIds.size > 0) {
      const { data: actors } = await supabase
        .from("users")
        .select("id, username, role")
        .in("id", Array.from(actorIds));

      if (actors) {
        actors.forEach((actor) => {
          actorMap.set(actor.id, {
            name: actor.username || "نامشخص",
            shortId: makeShortIdFromUuid(actor.id),
            role: actor.role as "admin" | "agent" | "super",
          });
        });
      }
    }

    // ترکیب و تبدیل تراکنش‌ها
    const allTransactions: FinancialTransaction[] = [];

    // تراکنش‌های به عنوان receiver
    if (transactionsAsReceiver) {
      for (const tx of transactionsAsReceiver) {
        const actor = tx.source_ref ? actorMap.get(tx.source_ref) : undefined;

        allTransactions.push({
          id: tx.id,
          amount: Number(tx.amount),
          type: tx.type === "deposit" ? "deposit" : "withdraw",
          status: tx.status,
          description: tx.description || undefined,
          createdAt: tx.created_at,
          actorId: tx.source_ref || undefined,
          actorName: actor?.name,
          actorShortId: actor?.shortId,
          actorRole: actor?.role,
        });
      }
    }

    // تراکنش‌های به عنوان sender (player به admin/agent واریز کرده)
    if (transactionsAsSender) {
      for (const tx of transactionsAsSender) {
        const actor = tx.user_id ? actorMap.get(tx.user_id) : undefined;

        allTransactions.push({
          id: tx.id,
          amount: Number(tx.amount),
          type: tx.type === "deposit" ? "deposit" : "withdraw",
          status: tx.status,
          description: tx.description || undefined,
          createdAt: tx.created_at,
          actorId: tx.user_id || undefined,
          actorName: actor?.name,
          actorShortId: actor?.shortId,
          actorRole: actor?.role,
        });
      }
    }

    // مرتب‌سازی بر اساس تاریخ (جدیدترین اول)
    allTransactions.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // محاسبه خلاصه
    const totalDeposits = allTransactions
      .filter((tx) => tx.type === "deposit")
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalWithdrawals = allTransactions
      .filter((tx) => tx.type === "withdraw")
      .reduce((sum, tx) => sum + tx.amount, 0);

    const summary: FinancialSummary = {
      period,
      totalDeposits,
      totalWithdrawals,
      netBalance: totalDeposits - totalWithdrawals,
      transactionCount: allTransactions.length,
    };

    // محاسبه آمار بازی (از همان from و to که قبلاً تعریف شده)

    // 1. مجموع کارت خریده شده (tickets با reservation_status = 'confirmed' یا 'consumed')
    //    + مجموع مبلغ خرید را ترجیحاً از روی tickets.price محاسبه می‌کنیم (دقیق‌ترین منبع per-ticket).
    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("id, room_id, transaction_id, price")
      .eq("player_user_id", currentUser.id)
      .in("reservation_status", ["confirmed", "consumed"])
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());

    if (ticketsError) {
      console.error("Error loading tickets:", ticketsError);
    }

    const totalCardsPurchased = tickets?.length || 0;

    // 2. مجموع مبلغ خرید
    // اولویت: جمع tickets.price (اگر موجود و غیر صفر باشد)
    const totalPurchaseAmountFromTickets =
      tickets?.reduce((sum, t: any) => sum + Number(t.price || 0), 0) || 0;

    // fallback: جمع تراکنش‌های مرتبط با خرید/ورود (در طراحی مالی ممکن است 'join' یا 'bet' باشد)
    const { data: purchaseTransactions, error: purchaseError } = await supabase
      .from("transactions")
      .select("amount, room_id")
      .eq("user_id", currentUser.id)
      .in("type", ["join", "bet"])
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());

    if (purchaseError) {
      console.error("Error loading purchase transactions (join/bet):", purchaseError);
    }

    const totalPurchaseAmountFromTransactions =
      purchaseTransactions?.reduce((sum, tx: any) => sum + Number(tx.amount || 0), 0) || 0;

    const totalPurchaseAmount =
      totalPurchaseAmountFromTickets > 0
        ? totalPurchaseAmountFromTickets
        : totalPurchaseAmountFromTransactions;

    // 3. تعداد برد خطی و پر (results)
    const { data: results, error: resultsError } = await supabase
      .from("results")
      .select("win_type, reward_amount")
      .eq("user_id", currentUser.id)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());

    if (resultsError) {
      console.error("Error loading results:", resultsError);
    }

    const lineWinsCount = results?.filter((r) => r.win_type === "line").length || 0;
    const fullWinsCount = results?.filter((r) => r.win_type === "full").length || 0;

    // 4. نرخ برد (درصد)
    const winRate =
      totalCardsPurchased > 0
        ? ((lineWinsCount + fullWinsCount) / totalCardsPurchased) * 100
        : 0;

    // 5. واریزی و برداشت (از summary که قبلاً محاسبه شده)
    // استفاده از totalDeposits و totalWithdrawals از summary

    // 6. میانگین کارت/بازی
    // تعداد روم‌های منحصر به فرد که player در آن‌ها کارت خریده
    const uniqueRoomIds = new Set<string>();
    tickets?.forEach((t) => {
      if (t.room_id) uniqueRoomIds.add(t.room_id);
    });
    purchaseTransactions?.forEach((tx: any) => {
      if (tx.room_id) uniqueRoomIds.add(tx.room_id);
    });

    const uniqueRoomsCount = uniqueRoomIds.size;
    const averageCardsPerGame =
      uniqueRoomsCount > 0 ? totalCardsPurchased / uniqueRoomsCount : 0;

    const gameStats: GameStatistics = {
      totalCardsPurchased,
      totalPurchaseAmount,
      lineWinsCount,
      fullWinsCount,
      winRate: Math.round(winRate * 100) / 100, // دو رقم اعشار
      deposits: summary.totalDeposits, // استفاده از همان مقدار summary
      withdrawals: summary.totalWithdrawals, // استفاده از همان مقدار summary
      averageCardsPerGame: Math.round(averageCardsPerGame * 100) / 100, // دو رقم اعشار
    };

    return {
      summary,
      transactions: allTransactions,
      gameStats,
    };
  } catch (error: any) {
    console.error("Error loading financial reports:", error);
    throw error;
  }
}

