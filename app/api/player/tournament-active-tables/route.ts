import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";

type TournamentActiveTable = {
  id: string;
  prize: number;
  players: number;
  cardCount: number;
  roundNo: number | null;
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

    const ticketPrice = Number((tournament as any).ticket_price || 0);

    const { data: roundRooms, error: roundErr } = await supabase
      .from("tournament_round_rooms")
      .select("room_id, round_no, table_no")
      .eq("tournament_id", tournamentId)
      .not("room_id", "is", null)
      .order("round_no", { ascending: false })
      .order("table_no", { ascending: true });

    if (roundErr || !roundRooms || roundRooms.length === 0) {
      return NextResponse.json({
        tables: [] as TournamentActiveTable[],
        currentRoundNo: null,
      });
    }

    const roomIds = (roundRooms as any[])
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
      .select("room_id, user_id, cards_count")
      .eq("tournament_id", tournamentId)
      .in("room_id", roomIds);

    if (assignmentsErr) {
      console.error("GET /api/player/tournament-active-tables assignments error:", assignmentsErr);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load tournament active tables." },
        { status: 500 }
      );
    }

    const roomStats = new Map<
      string,
      {
        players: Set<string>;
        cards: number;
      }
    >();

    (assignments || []).forEach((row: any) => {
      const roomId = row.room_id as string | null;
      if (!roomId) return;
      if (!roomStats.has(roomId)) {
        roomStats.set(roomId, { players: new Set(), cards: 0 });
      }
      const stats = roomStats.get(roomId)!;
      if (row.user_id) {
        stats.players.add(row.user_id as string);
      }
      stats.cards += Number(row.cards_count || 0);
    });

    const tables: TournamentActiveTable[] = (roundRooms as any[]).map((row: any) => {
      const roomId = row.room_id as string;
      const stats = roomStats.get(roomId) || { players: new Set<string>(), cards: 0 };
      const cardCount = stats.cards;
      return {
        id: roomId,
        prize: ticketPrice * cardCount,
        players: stats.players.size,
        cardCount,
        roundNo: row.round_no ?? null,
      };
    });

    const currentRoundNo =
      (roundRooms as any[])
        .map((row: any) => row.round_no)
        .filter((value: any) => value != null)
        .sort((a: number, b: number) => b - a)[0] ?? null;

    return NextResponse.json({ tables, currentRoundNo });
  } catch (err: any) {
    console.error("GET /api/player/tournament-active-tables error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load tournament active tables." },
      { status: 500 }
    );
  }
}

