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

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * محاسبه محدوده تاریخ برای یک دوره
 */
function getPeriodDateRange(period: ReportPeriod): { from: Date; to: Date } {
  const now = new Date();
  let from: Date;

  if (period === "day") {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  } else if (period === "week") {
    // آخرین ۷ روز (شامل امروز) برای جلوگیری از اختلافات شروع هفته
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    // month (از ابتدای ماه به وقت UTC)
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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
    const creditTypes = new Set([
      "deposit",
      "win",
      "payout",
      "join_refund",
      "transfer_in",
    ]);
    const debitTypes = new Set([
      "withdraw",
      "join_hold",
      "join_capture",
      "bet",
      "fee_agent",
      "fee_super",
      "fee_admin",
      "transfer_out",
    ]);
    const joinTransactionTypes = new Set([
      "join",
      "bet",
      "join_hold",
      "join_capture",
      "join_refund",
    ]);

    const mapTransactionDirection = (type: string): "deposit" | "withdraw" => {
      if (creditTypes.has(type)) return "deposit";
      if (debitTypes.has(type)) return "withdraw";
      // fallback: keep previous behavior
      return type === "deposit" ? "deposit" : "withdraw";
    };

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

    // گرفتن تراکنش‌ها که player در آن‌ها receiver است
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
        user_id,
        room_id
      `
      )
      .eq("user_id", currentUser.id) // player به عنوان receiver
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false });

    if (receiverError) {
      console.error("Error loading transactions as receiver:", receiverError);
    }

    // گرفتن تراکنش‌هایی که player به عنوان sender است (در source_ref)
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
        user_id,
        room_id
      `
      )
      .eq("source_ref", currentUser.id) // player به عنوان sender (در source_ref)
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

    // حذف تراکنش‌های مربوط به روم‌های تورنومنت (join/hold/payout و ...)
    const roomIdsForTransactions = new Set<string>();
    transactionsAsReceiver?.forEach((tx: any) => {
      if (tx.room_id) roomIdsForTransactions.add(tx.room_id);
    });
    transactionsAsSender?.forEach((tx: any) => {
      if (tx.room_id) roomIdsForTransactions.add(tx.room_id);
    });

    const tournamentRoomIds = new Set<string>();
    if (roomIdsForTransactions.size > 0) {
      const batches = chunkArray(Array.from(roomIdsForTransactions), 200);
      for (const batch of batches) {
        const { data: roomsData, error: roomsError } = await supabase
          .from("rooms")
          .select("id, room_template_id")
          .in("id", batch);

        if (roomsError) {
          console.error("Error loading rooms for transactions:", roomsError);
          continue;
        }

        const templateIds = Array.from(
          new Set(
            (roomsData || [])
              .map((room: any) => room.room_template_id)
              .filter(Boolean)
          )
        );

        const templateTypeById = new Map<string, string>();
        if (templateIds.length > 0) {
          const { data: templatesData, error: templatesError } = await supabase
            .from("room_templates")
            .select("id, room_type")
            .in("id", templateIds);

          if (templatesError) {
            console.error("Error loading room templates for transactions:", templatesError);
          } else {
            templatesData?.forEach((template: any) => {
              if (template?.id) templateTypeById.set(template.id, template.room_type);
            });
          }
        }

        roomsData?.forEach((room: any) => {
          const roomType = room.room_template_id
            ? templateTypeById.get(room.room_template_id)
            : undefined;
          if (roomType === "tournament") {
            tournamentRoomIds.add(room.id);
          }
        });
      }
    }

    const isTournamentRoomTransaction = (tx: any) =>
      tx.room_id && tournamentRoomIds.has(tx.room_id);

    const isTournamentCommissionTransaction = (tx: any) => {
      const desc = String(tx.description || "").toLowerCase();
      return desc.includes("tournament commission payout");
    };

    // ترکیب و تبدیل تراکنش‌ها
    const allTransactions: FinancialTransaction[] = [];
    const seenTransactionIds = new Set<string>();

    // تراکنش‌های به عنوان receiver
    if (transactionsAsReceiver) {
      for (const tx of transactionsAsReceiver) {
        if (isTournamentRoomTransaction(tx) || isTournamentCommissionTransaction(tx)) continue;
        if (seenTransactionIds.has(tx.id)) continue;
        seenTransactionIds.add(tx.id);
        const actor = tx.source_ref ? actorMap.get(tx.source_ref) : undefined;

        allTransactions.push({
          id: tx.id,
          amount: Number(tx.amount),
          type: mapTransactionDirection(String(tx.type)),
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
        if (isTournamentRoomTransaction(tx) || isTournamentCommissionTransaction(tx)) continue;
        if (seenTransactionIds.has(tx.id)) continue;
        seenTransactionIds.add(tx.id);
        const actor = tx.user_id ? actorMap.get(tx.user_id) : undefined;

        allTransactions.push({
          id: tx.id,
          amount: Number(tx.amount),
          type: mapTransactionDirection(String(tx.type)),
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

    // محاسبه آمار بازی (فقط روم‌های normal) به صورت server-side
    const { data: gameStatsRows, error: gameStatsError } = await supabase.rpc(
      "fn_player_game_stats",
      {
        p_user_id: currentUser.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      }
    );

    if (gameStatsError) {
      console.error("Error loading game stats:", gameStatsError);
    }

    const rawStats = Array.isArray(gameStatsRows) ? gameStatsRows[0] : null;
    const gameStats: GameStatistics = {
      totalCardsPurchased: Number(rawStats?.total_cards_purchased || 0),
      totalPurchaseAmount: Number(rawStats?.total_purchase_amount || 0),
      lineWinsCount: Number(rawStats?.line_wins_count || 0),
      fullWinsCount: Number(rawStats?.full_wins_count || 0),
      winRate: Number(rawStats?.win_rate || 0),
      deposits: summary.totalDeposits,
      withdrawals: summary.totalWithdrawals,
      averageCardsPerGame: Number(rawStats?.average_cards_per_game || 0),
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

