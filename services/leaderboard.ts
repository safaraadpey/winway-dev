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
 * محاسبه محدوده تاریخ برای امروز
 */
function getTodayDateRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(now);
  return { from, to };
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

    // 1. بارگذاری بردها (results) برای امروز
    const { data: results, error: resultsError } = await supabase
      .from("results")
      .select(
        `
        id,
        reward_amount,
        created_at,
        room_id,
        rooms (
          id,
          title,
          room_code,
          price,
          card_price
        )
      `
      )
      .eq("user_id", currentUser.id)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false });

    if (resultsError) {
      console.error("Error loading results:", resultsError);
    }

    // تبدیل results به WinRecord
    const wins: WinRecord[] =
      results?.map((r: any) => {
        const room = r.rooms;
        return {
          id: r.id,
          gameTime: new Date(r.created_at).toLocaleTimeString("fa-IR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          amountWon: Number(r.reward_amount || 0),
          roomName: room?.title || room?.room_code || "نامشخص",
          roomCode: room?.room_code,
        };
      }) || [];

    // محاسبه مجموع مبلغ برد امروز
    const totalWinningsToday = wins.reduce((sum, win) => sum + win.amountWon, 0);

    // 2. بارگذاری خریدها (tickets + transactions) برای امروز
    // ابتدا tickets را می‌گیریم
    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select(
        `
        id,
        room_id,
        transaction_id,
        created_at,
        rooms (
          id,
          title,
          room_code,
          price,
          card_price
        )
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

    // گرفتن transaction_id های منحصر به فرد
    const transactionIds = new Set<string>();
    tickets?.forEach((t: any) => {
      if (t.transaction_id) transactionIds.add(t.transaction_id);
    });

    // بارگذاری transactions برای محاسبه مبلغ خرید
    let transactionsMap = new Map<string, { amount: number; room_id: string }>();
    if (transactionIds.size > 0) {
      const { data: transactions, error: transactionsError } = await supabase
        .from("transactions")
        .select("id, amount, related_room")
        .eq("type", "bet")
        .eq("user_id", currentUser.id)
        .in("id", Array.from(transactionIds))
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString());

      if (transactionsError) {
        console.error("Error loading transactions:", transactionsError);
      }

      transactions?.forEach((tx: any) => {
        transactionsMap.set(tx.id, {
          amount: Number(tx.amount || 0),
          room_id: tx.related_room || "",
        });
      });
    }

    // گروه‌بندی tickets بر اساس room_id و transaction_id
    const purchasesMap = new Map<string, PurchaseRecord>();

    tickets?.forEach((t: any) => {
      const room = t.rooms;
      const roomId = t.room_id;
      const transactionId = t.transaction_id;
      const key = `${roomId}_${transactionId}`;

      if (!purchasesMap.has(key)) {
        const tx = transactionId ? transactionsMap.get(transactionId) : null;
        purchasesMap.set(key, {
          id: transactionId || t.id,
          purchaseAmount: tx?.amount || Number(room?.card_price || room?.price || 0),
          cardCount: 0,
          roomName: room?.title || room?.room_code || "نامشخص",
          roomCode: room?.room_code,
        });
      }

      // افزایش تعداد کارت
      const purchase = purchasesMap.get(key);
      if (purchase) {
        purchase.cardCount += 1;
      }
    });

    const purchases: PurchaseRecord[] = Array.from(purchasesMap.values());

    // محاسبه مجموع مبلغ خرید امروز
    const totalPurchasesToday = purchases.reduce(
      (sum, purchase) => sum + purchase.purchaseAmount,
      0
    );

    // 3. بارگذاری رتبه‌بندی (Leaderboard)
    // محاسبه مجموع برد و تعداد کارت برای هر بازیکن

    // گرفتن همه results برای محاسبه مجموع برد هر بازیکن
    const { data: allResults, error: allResultsError } = await supabase
      .from("results")
      .select("user_id, reward_amount")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());

    if (allResultsError) {
      console.error("Error loading all results:", allResultsError);
    }

    // محاسبه مجموع برد برای هر بازیکن
    const winsByPlayer = new Map<string, number>();
    allResults?.forEach((r: any) => {
      const userId = r.user_id;
      const amount = Number(r.reward_amount || 0);
      winsByPlayer.set(userId, (winsByPlayer.get(userId) || 0) + amount);
    });

    // گرفتن همه tickets برای محاسبه تعداد کارت هر بازیکن
    const { data: allTickets, error: allTicketsError } = await supabase
      .from("tickets")
      .select("player_user_id")
      .in("reservation_status", ["confirmed", "consumed"])
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());

    if (allTicketsError) {
      console.error("Error loading all tickets:", allTicketsError);
    }

    // محاسبه تعداد کارت برای هر بازیکن
    const cardsByPlayer = new Map<string, number>();
    allTickets?.forEach((t: any) => {
      const userId = t.player_user_id;
      cardsByPlayer.set(userId, (cardsByPlayer.get(userId) || 0) + 1);
    });

    // گرفتن اطلاعات کاربران که در رتبه‌بندی هستند
    const playerIds = new Set<string>();
    winsByPlayer.forEach((_, userId) => playerIds.add(userId));
    cardsByPlayer.forEach((_, userId) => playerIds.add(userId));

    // بارگذاری اطلاعات کاربران
    const { data: players, error: playersError } = await supabase
      .from("users")
      .select(
        `
        id,
        username,
        user_profiles (
          nickname,
          avatar_url
        )
      `
      )
      .eq("role", "player")
      .in("id", Array.from(playerIds));

    if (playersError) {
      console.error("Error loading players:", playersError);
    }

    // ساخت لیست رتبه‌بندی
    const leaderboardEntries: LeaderboardEntry[] = [];

    players?.forEach((player: any) => {
      const userId = player.id;
      const totalWins = winsByPlayer.get(userId) || 0;
      const cardCount = cardsByPlayer.get(userId) || 0;

      // فقط بازیکنانی که حداقل یک برد یا کارت داشته‌اند
      if (totalWins > 0 || cardCount > 0) {
        const profile = player.user_profiles;

        leaderboardEntries.push({
          rank: 0, // بعداً محاسبه می‌شود
          playerId: userId,
          playerName: player.username || "نامشخص",
          displayName: profile?.nickname,
          avatarUrl: profile?.avatar_url,
          totalWins,
          cardCount,
        });
      }
    });

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

    return {
      totalWinningsToday,
      totalPurchasesToday,
      wins,
      purchases,
      leaderboard: leaderboardEntries,
    };
  } catch (error: any) {
    console.error("Error loading leaderboard data:", error);
    throw error;
  }
}

