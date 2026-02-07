// services/leaderboard.ts
//
// Service for loading leaderboard/history data for players

import { supabase } from "@/lib/supabaseClient";
import type {
  LeaderboardData,
  LeaderboardEntry,
  WinRecord,
  PurchaseRecord,
} from "@/src/types/leaderboard";

/**
 * محاسبه محدوده تاریخ برای امروز (UTC)
 */
function getTodayDateRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(now);
  return { from, to };
}

/**
 * محاسبه محدوده تاریخ برای 7 روز گذشته (UTC)
 */
function getLastWeekDateRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from, to: now };
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
 * بارگذاری داده‌های رتبه‌بندی/سوابق برای پلیر
 */
export async function loadLeaderboardData(): Promise<LeaderboardData> {
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

    const { from, to } = getTodayDateRange();
    const { from: weekFrom, to: weekTo } = getLastWeekDateRange();

    // 1. بارگذاری بردها (results) برای امروز
    const { data: results, error: resultsError } = await supabase
      .from("results")
      .select(
        `
        id,
        reward_amount,
        created_at,
        room_id
      `
      )
      .eq("user_id", currentUser.id)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false });

    if (resultsError) {
      console.error("Error loading results:", resultsError);
    }

    // 2. بارگذاری خریدها (tickets + transactions) برای امروز
    // ابتدا tickets را می‌گیریم
    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select(
        `
        id,
        room_id,
        transaction_id,
        created_at
      `
      )
      .eq("player_user_id", currentUser.id)
      .in("reservation_status", ["confirmed", "consumed"])
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false });

    if (ticketsError) {
      console.error("Error loading tickets:", ticketsError);
    }

    const roomIds = new Set<string>();
    results?.forEach((row: any) => {
      if (row.room_id) roomIds.add(row.room_id);
    });
    tickets?.forEach((row: any) => {
      if (row.room_id) roomIds.add(row.room_id);
    });

    const normalTemplateIds = new Set<string>();
    const { data: templates, error: templatesError } = await supabase
      .from("room_templates")
      .select("id")
      .eq("room_type", "normal");

    if (templatesError) {
      console.error("Error loading normal room templates for leaderboard:", templatesError);
    }

    templates?.forEach((row: any) => {
      if (row?.id) normalTemplateIds.add(row.id);
    });
    const normalTemplateIdList = Array.from(normalTemplateIds);

    // بارگذاری اطلاعات اتاق‌های normal برای نمایش
    const roomsById = new Map<
      string,
      {
        id: string;
        title: string | null;
        room_code: string | null;
        price: number | null;
        card_price: number | null;
        room_template_id: string | null;
      }
    >();
    const normalRoomIds = new Set<string>();

    if (roomIds.size > 0 && normalTemplateIds.size > 0) {
      const roomIdBatches = chunkArray(Array.from(roomIds), 200);
      for (const batch of roomIdBatches) {
        const { data: roomsData, error: roomsError } = await supabase.rpc(
          "fn_rooms_by_ids",
          {
            p_room_ids: batch,
            p_template_ids: normalTemplateIdList,
          }
        );

        if (roomsError) {
          console.error("Error loading rooms for leaderboard:", roomsError);
          continue;
        }

        roomsData?.forEach((room: any) => {
          roomsById.set(room.id, {
            id: room.id,
            title: room.title ?? null,
            room_code: room.room_code ?? null,
            price: room.price != null ? Number(room.price) : null,
            card_price: room.card_price != null ? Number(room.card_price) : null,
            room_template_id: room.room_template_id ?? null,
          });
          normalRoomIds.add(room.id);
        });
      }
    }

    const isNormalRoom = (roomId?: string | null) =>
      !!roomId && normalRoomIds.has(roomId);

    // تبدیل results به WinRecord
    const wins: WinRecord[] =
      results
        ?.filter((row: any) => isNormalRoom(row.room_id))
        .map((row: any) => {
          const room = row.room_id ? roomsById.get(row.room_id) : null;
          return {
            id: row.id,
            gameTime: new Date(row.created_at).toLocaleTimeString("fa-IR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            amountWon: Number(row.reward_amount || 0),
            roomName: room?.title || room?.room_code || "نامشخص",
            roomCode: room?.room_code ?? undefined,
          };
        }) || [];

    // محاسبه مجموع مبلغ برد امروز
    const totalWinningsToday = wins.reduce((sum, win) => sum + win.amountWon, 0);

    const { data: purchaseRows, error: purchaseError } = await supabase.rpc(
      "fn_player_purchase_history",
      {
        p_user_id: currentUser.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      }
    );

    if (purchaseError) {
      console.error("Error loading purchases:", purchaseError);
    }

    const purchases: PurchaseRecord[] =
      purchaseRows?.map((row: any) => ({
        id: row.transaction_id || row.room_id,
        purchaseAmount: Number(row.purchase_amount || 0),
        cardCount: Number(row.card_count || 0),
        roomName: row.room_title || row.room_code || "نامشخص",
        roomCode: row.room_code ?? undefined,
      })) || [];

    // محاسبه مجموع مبلغ خرید امروز
    const totalPurchasesToday = purchases.reduce(
      (sum, purchase) => sum + purchase.purchaseAmount,
      0
    );

    // 3. بارگذاری رتبه‌بندی (Leaderboard) برای ۷ روز گذشته (normal rooms)
    const { data: leaderboardRows, error: leaderboardError } = await supabase.rpc(
      "fn_leaderboard_weekly",
      {
        p_from: weekFrom.toISOString(),
        p_to: weekTo.toISOString(),
      }
    );

    if (leaderboardError) {
      console.error("Error loading leaderboard:", leaderboardError);
    }

    const leaderboardEntries: LeaderboardEntry[] =
      leaderboardRows?.map((row: any) => ({
        rank: 0,
        playerId: row.player_id,
        playerName: row.player_name || "نامشخص",
        displayName: row.display_name ?? undefined,
        avatarUrl: row.avatar_url ?? undefined,
        totalWins: Number(row.total_wins || 0),
        cardCount: Number(row.card_count || 0),
      })) || [];

    // مرتب‌سازی بر اساس مجموع برد (نزولی)، سپس تعداد کارت (نزولی)
    leaderboardEntries.sort((a, b) => {
      if (b.totalWins !== a.totalWins) {
        return b.totalWins - a.totalWins;
      }
      return b.cardCount - a.cardCount;
    });

    // اختصاص رتبه
    leaderboardEntries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // 4. بارگذاری آمار روزانه، هفتگی و ماهیانه
    const { data: statsRows, error: statsError } = await supabase.rpc(
      "fn_player_stats",
      {
        p_user_id: currentUser.id,
        p_date: new Date().toISOString(),
      }
    );

    if (statsError) {
      console.error("Error loading player stats:", statsError);
    }

    // تبدیل آمار به object
    const statsMap = new Map<string, any>();
    statsRows?.forEach((row: any) => {
      statsMap.set(row.period_type, {
        totalWinnings: Number(row.total_winnings || 0),
        tournamentWinnings: Number(row.tournament_winnings || 0),
        totalPurchases: Number(row.total_purchases || 0),
        cardCount: Number(row.card_count || 0),
        winCount: Number(row.win_count || 0),
        lineWinsCount: Number(row.line_wins_count || 0),
        fullWinsCount: Number(row.full_wins_count || 0),
        purchaseCount: Number(row.purchase_count || 0),
      });
    });

    const defaultStats = {
      totalWinnings: 0,
      tournamentWinnings: 0,
      totalPurchases: 0,
      cardCount: 0,
      winCount: 0,
      lineWinsCount: 0,
      fullWinsCount: 0,
      purchaseCount: 0,
    };

    return {
      totalWinningsToday,
      totalPurchasesToday,
      wins,
      purchases,
      leaderboard: leaderboardEntries,
      stats: {
        daily: statsMap.get("daily") || defaultStats,
        weekly: statsMap.get("weekly") || defaultStats,
        monthly: statsMap.get("monthly") || defaultStats,
      },
    };
  } catch (error: any) {
    console.error("Error loading leaderboard data:", error);
    throw error;
  }
}

