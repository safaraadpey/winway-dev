import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TournamentActiveTable = {
  id: string;
  prize: number;
  players: number;
  cardCount: number;
  roundNo: number | null;
  tableNo: number | null;
  winnerNames?: string[];
  isFinished?: boolean;
};

const FINISHED_ROOM_STATUSES = new Set(["finished", "settling", "settled"]);

const pickDisplayName = (
  nickname: string | null | undefined,
  username: string | null | undefined,
  email: string | null | undefined
) => {
  const fromEmail = email?.split("@")?.[0]?.trim() || null;
  return nickname?.trim() || username?.trim() || fromEmail || "بازیکن";
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tournamentId = url.searchParams.get("tournamentId");

    if (!tournamentId) {
      return NextResponse.json(
        { error: "missing_parameters", message: "tournamentId is required." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data: tournament, error: tournamentErr } = await supabase
      .from("tournaments")
      .select("id, ticket_price")
      .eq("id", tournamentId)
      .single();

    if (tournamentErr || !tournament) {
      return NextResponse.json(
        { error: "tournament_not_found", message: "Tournament not found." },
        { status: 404 }
      );
    }

    const ticketPrice = Number((tournament as { ticket_price?: number | null }).ticket_price || 0);

    const { data: roundRooms, error: roundErr } = await supabase
      .from("tournament_round_rooms")
      .select("room_id, round_no, table_no")
      .eq("tournament_id", tournamentId)
      .not("room_id", "is", null)
      .order("round_no", { ascending: false })
      .order("table_no", { ascending: true });

    if (roundErr) {
      console.error("[Tournament] active-tables roundRooms error:", roundErr);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load tournament round rooms." },
        { status: 500 }
      );
    }

    if (!roundRooms || roundRooms.length === 0) {
      return NextResponse.json({
        tables: [] as TournamentActiveTable[],
        currentRoundNo: null,
      });
    }

    const roomIds = (roundRooms as { room_id: string | null }[])
      .map((row) => row.room_id)
      .filter(Boolean) as string[];

    if (roomIds.length === 0) {
      return NextResponse.json({
        tables: [] as TournamentActiveTable[],
        currentRoundNo: null,
      });
    }

    const { data: assignments, error: assignmentsErr } = await supabase
      .from("tournament_round_assignments")
      .select("room_id, game_room_id, user_id, cards_count")
      .eq("tournament_id", tournamentId);

    if (assignmentsErr) {
      console.error("GET /api/player/tournament-active-tables assignments error:", assignmentsErr);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load tournament active tables." },
        { status: 500 }
      );
    }

    const roomStats = new Map<string, { players: Set<string>; cards: number }>();

    (assignments || []).forEach((row: {
      room_id?: string | null;
      game_room_id?: string | null;
      user_id?: string | null;
      cards_count?: number | null;
    }) => {
      const roomId = (row.game_room_id || row.room_id) as string | null;
      if (!roomId || !roomIds.includes(roomId)) return;
      if (!roomStats.has(roomId)) {
        roomStats.set(roomId, { players: new Set(), cards: 0 });
      }
      const stats = roomStats.get(roomId)!;
      if (row.user_id) stats.players.add(row.user_id);
      stats.cards += Number(row.cards_count || 0);
    });

    const { data: roomRows, error: roomsErr } = await supabase
      .from("rooms")
      .select("id, status")
      .in("id", roomIds);

    if (roomsErr) {
      console.error("GET /api/player/tournament-active-tables rooms error:", roomsErr);
    }

    const finishedRoomIds = new Set<string>();
    (roomRows || []).forEach((row: { id: string; status?: string | null }) => {
      const status = (row.status || "").trim().toLowerCase();
      if (FINISHED_ROOM_STATUSES.has(status)) {
        finishedRoomIds.add(row.id);
      }
    });

    const winnersByRoom = new Map<string, string[]>();
    const winnerUserIds = new Set<string>();

    if (finishedRoomIds.size > 0) {
      const { data: roomWinners, error: winnersErr } = await supabase
        .from("room_winners")
        .select("room_id, user_id")
        .in("room_id", Array.from(finishedRoomIds));

      if (winnersErr) {
        console.error("GET /api/player/tournament-active-tables winners error:", winnersErr);
      } else {
        (roomWinners || []).forEach((row: { room_id?: string | null; user_id?: string | null }) => {
          const roomId = row.room_id as string | null;
          const userId = row.user_id as string | null;
          if (!roomId || !userId) return;
          if (!winnersByRoom.has(roomId)) winnersByRoom.set(roomId, []);
          const list = winnersByRoom.get(roomId)!;
          if (!list.includes(userId)) list.push(userId);
          winnerUserIds.add(userId);
        });
      }
    }

    const namesByUserId = new Map<string, string>();
    if (winnerUserIds.size > 0) {
      const { data: users, error: usersErr } = await supabase
        .from("users")
        .select("id, username, email, user_profiles(nickname)")
        .in("id", Array.from(winnerUserIds));

      if (usersErr) {
        console.error("GET /api/player/tournament-active-tables users error:", usersErr);
      } else {
        (users || []).forEach((u: {
          id: string;
          username?: string | null;
          email?: string | null;
          user_profiles?: { nickname?: string | null } | { nickname?: string | null }[] | null;
        }) => {
          const profile = Array.isArray(u.user_profiles) ? u.user_profiles[0] : u.user_profiles;
          namesByUserId.set(
            u.id,
            pickDisplayName(profile?.nickname, u.username, u.email)
          );
        });
      }
    }

    const tables: TournamentActiveTable[] = (roundRooms as {
      room_id: string;
      round_no: number | null;
      table_no: number | null;
    }[]).map((row) => {
      const roomId = row.room_id;
      const stats = roomStats.get(roomId) || { players: new Set<string>(), cards: 0 };
      const cardCount = stats.cards;
      const isFinished = finishedRoomIds.has(roomId);
      const winnerIds = winnersByRoom.get(roomId) || [];
      const winnerNames = winnerIds.map((id) => namesByUserId.get(id) || "بازیکن");

      return {
        id: roomId,
        prize: ticketPrice * cardCount,
        players: stats.players.size,
        cardCount,
        roundNo: row.round_no ?? null,
        tableNo: row.table_no ?? null,
        ...(isFinished ? { isFinished: true, winnerNames } : {}),
      };
    });

    const currentRoundNo =
      (roundRooms as { round_no: number | null }[])
        .map((row) => row.round_no)
        .filter((value): value is number => value != null)
        .sort((a, b) => b - a)[0] ?? null;

    return NextResponse.json(
      { tables, currentRoundNo },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    console.error("[Tournament] GET /api/player/tournament-active-tables error:", err);
    const message = err instanceof Error ? err.message : "Failed to load tournament active tables.";
    return NextResponse.json({ error: "internal_error", message }, { status: 500 });
  }
}
