import { NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FinishedTable = {
  id: string;
  prize: number;
  players: number;
  cardCount: number;
  roundNo: number | null;
  tableNo: number | null;
  winnerNames: string[];
};

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

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    const supabase = createServiceClient();

    const { data: tournament, error: tournamentErr } = await supabase
      .from("tournaments")
      .select("id, status, ticket_price")
      .eq("id", tournamentId)
      .single();

    if (tournamentErr || !tournament) {
      return NextResponse.json(
        { error: "tournament_not_found", message: "Tournament not found." },
        { status: 404 }
      );
    }

    const status = (tournament as { status?: string | null }).status;
    if (status !== "finished" && status !== "settling") {
      return NextResponse.json(
        { error: "tournament_not_finished", message: "Tournament is not finished." },
        { status: 400 }
      );
    }

    const ticketPrice = Number((tournament as { ticket_price?: number | null }).ticket_price || 0);

    const { data: roundRooms, error: roundErr } = await supabase
      .from("tournament_round_rooms")
      .select("room_id, round_no, table_no")
      .eq("tournament_id", tournamentId)
      .not("room_id", "is", null)
      .order("round_no", { ascending: true })
      .order("table_no", { ascending: true });

    if (roundErr || !roundRooms || roundRooms.length === 0) {
      return NextResponse.json({ tables: [] as FinishedTable[] });
    }

    const roomIds = (roundRooms as { room_id: string | null }[])
      .map((row) => row.room_id)
      .filter(Boolean) as string[];

    if (roomIds.length === 0) {
      return NextResponse.json({ tables: [] as FinishedTable[] });
    }

    const { data: assignments, error: assignmentsErr } = await supabase
      .from("tournament_round_assignments")
      .select("room_id, game_room_id, user_id, cards_count")
      .eq("tournament_id", tournamentId);

    if (assignmentsErr) {
      console.error(
        "GET /api/player/tournament-finished-tables assignments error:",
        assignmentsErr
      );
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load tournament tables." },
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

    const { data: roomWinners, error: winnersErr } = await supabase
      .from("room_winners")
      .select("room_id, user_id")
      .in("room_id", roomIds);

    if (winnersErr) {
      console.error(
        "GET /api/player/tournament-finished-tables winners error:",
        winnersErr
      );
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load table winners." },
        { status: 500 }
      );
    }

    const winnersByRoom = new Map<string, string[]>();
    const winnerUserIds = new Set<string>();

    (roomWinners || []).forEach((row: { room_id?: string | null; user_id?: string | null }) => {
      const roomId = row.room_id as string | null;
      const userId = row.user_id as string | null;
      if (!roomId || !userId) return;
      if (!winnersByRoom.has(roomId)) winnersByRoom.set(roomId, []);
      const list = winnersByRoom.get(roomId)!;
      if (!list.includes(userId)) list.push(userId);
      winnerUserIds.add(userId);
    });

    const namesByUserId = new Map<string, string>();
    if (winnerUserIds.size > 0) {
      const { data: users, error: usersErr } = await supabase
        .from("users")
        .select("id, username, email, user_profiles(nickname)")
        .in("id", Array.from(winnerUserIds));

      if (usersErr) {
        console.error(
          "GET /api/player/tournament-finished-tables users error:",
          usersErr
        );
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

    const tables: FinishedTable[] = (roundRooms as {
      room_id: string;
      round_no: number | null;
      table_no: number | null;
    }[]).map((row) => {
      const roomId = row.room_id;
      const stats = roomStats.get(roomId) || { players: new Set<string>(), cards: 0 };
      const winnerIds = winnersByRoom.get(roomId) || [];
      const winnerNames = winnerIds.map((id) => namesByUserId.get(id) || "بازیکن");
      return {
        id: roomId,
        prize: ticketPrice * stats.cards,
        players: stats.players.size,
        cardCount: stats.cards,
        roundNo: row.round_no ?? null,
        tableNo: row.table_no ?? null,
        winnerNames,
      };
    });

    return NextResponse.json({ tables });
  } catch (err: unknown) {
    console.error("GET /api/player/tournament-finished-tables error:", err);
    const message = err instanceof Error ? err.message : "Failed to load finished tables.";
    return NextResponse.json({ error: "internal_error", message }, { status: 500 });
  }
}
