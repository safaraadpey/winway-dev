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

    // 3. بارگذاری رتبه‌بندی (Leaderboard)
    // محاسبه مجموع برد و تعداد کارت برای هر بازیکن

    // گرفتن همه results برای محاسبه مجموع برد هر بازیکن
    const { data: allResults, error: allResultsError } = await supabase
      .from("results")
      .select(
        `
        user_id,
        reward_amount,
        room_id
      `
      )
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());

    if (allResultsError) {
      console.error("Error loading all results:", allResultsError);
    }

    // گرفتن همه tickets برای محاسبه تعداد کارت هر بازیکن
    const { data: allTickets, error: allTicketsError } = await supabase
      .from("tickets")
      .select(
        `
        player_user_id,
        room_id
      `
      )
      .in("reservation_status", ["confirmed", "consumed"])
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());

    if (allTicketsError) {
      console.error("Error loading all tickets:", allTicketsError);
    }

    const allRoomIds = new Set<string>();
    allResults?.forEach((row: any) => {
      if (row.room_id) allRoomIds.add(row.room_id);
    });
    allTickets?.forEach((row: any) => {
      if (row.room_id) allRoomIds.add(row.room_id);
    });

    const normalRoomIdsAll = new Set<string>();
    if (allRoomIds.size > 0 && normalTemplateIds.size > 0) {
      const allRoomIdBatches = chunkArray(Array.from(allRoomIds), 200);
      for (const batch of allRoomIdBatches) {
        const { data: allRooms, error: allRoomsError } = await supabase.rpc(
          "fn_rooms_by_ids",
          {
            p_room_ids: batch,
            p_template_ids: normalTemplateIdList,
          }
        );

        if (allRoomsError) {
          console.error("Error loading rooms for leaderboard totals:", allRoomsError);
          continue;
        }

        allRooms?.forEach((room: any) => {
          if (room?.id) normalRoomIdsAll.add(room.id);
        });
      }
    }

    const isNormalRoomAll = (roomId?: string | null) =>
      !!roomId && normalRoomIdsAll.has(roomId);

    // محاسبه مجموع برد برای هر بازیکن
    const winsByPlayer = new Map<string, number>();
    allResults
      ?.filter((row: any) => isNormalRoomAll(row.room_id))
      .forEach((row: any) => {
        const userId = row.user_id;
        const amount = Number(row.reward_amount || 0);
        winsByPlayer.set(userId, (winsByPlayer.get(userId) || 0) + amount);
      });

    // محاسبه تعداد کارت برای هر بازیکن
    const cardsByPlayer = new Map<string, number>();
    allTickets
      ?.filter((row: any) => isNormalRoomAll(row.room_id))
      .forEach((row: any) => {
        const userId = row.player_user_id;
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

