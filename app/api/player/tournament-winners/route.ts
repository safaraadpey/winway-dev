import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TournamentWinner = {
  userId: string;
  name: string;
  rank: number | null;
  amount: number | null;
};

const pickDisplayName = (
  nickname: string | null | undefined,
  username: string | null | undefined,
  email: string | null | undefined
) => {
  const fromEmail = email?.split("@")?.[0]?.trim() || null;
  return nickname?.trim() || username?.trim() || fromEmail || "بازیکن";
};

async function loadNamesByUserId(
  supabase: ReturnType<typeof createServiceClient>,
  userIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (userIds.length === 0) return names;

  const { data: users, error } = await supabase
    .from("users")
    .select("id, username, email, user_profiles(nickname)")
    .in("id", userIds);

  if (error) {
    console.error("[Tournament] winners names lookup failed", error);
    return names;
  }

  for (const u of users || []) {
    const row = u as {
      id: string;
      username?: string | null;
      email?: string | null;
      user_profiles?:
        | { nickname?: string | null }
        | { nickname?: string | null }[]
        | null;
    };
    const profile = Array.isArray(row.user_profiles)
      ? row.user_profiles[0]
      : row.user_profiles;
    names.set(
      row.id,
      pickDisplayName(profile?.nickname, row.username, row.email)
    );
  }
  return names;
}

/**
 * GET /api/player/tournament-winners?tournamentId=
 * Returns final winners with display names (service-role; bypasses users RLS embeds).
 */
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
      .select("id, status")
      .eq("id", tournamentId)
      .single();

    if (tournamentErr || !tournament) {
      return NextResponse.json(
        { error: "tournament_not_found", message: "Tournament not found." },
        { status: 404 }
      );
    }

    const status = String((tournament as { status?: string }).status || "");
    if (status !== "finished" && status !== "settling") {
      return NextResponse.json({ winners: [] as TournamentWinner[] });
    }

    const { data: payouts, error: payoutsErr } = await supabase
      .from("tournament_payouts")
      .select("user_id, amount, rank")
      .eq("tournament_id", tournamentId)
      .order("rank", { ascending: true });

    if (payoutsErr) {
      console.error("[Tournament] winners payouts error", payoutsErr);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load tournament winners." },
        { status: 500 }
      );
    }

    if (payouts && payouts.length > 0) {
      const userIds = Array.from(
        new Set(
          payouts
            .map((row: { user_id?: string | null }) => row.user_id)
            .filter(Boolean) as string[]
        )
      );
      const names = await loadNamesByUserId(supabase, userIds);
      const winners: TournamentWinner[] = payouts.map(
        (row: { user_id?: string | null; amount?: number | null; rank?: number | null }) => {
          const userId = String(row.user_id || "");
          return {
            userId,
            name: names.get(userId) || "بازیکن",
            rank: row.rank != null ? Number(row.rank) : null,
            amount: row.amount != null ? Number(row.amount) : null,
          };
        }
      );
      return NextResponse.json({ winners });
    }

    // Fallback: final-round room_winners
    const { data: lastRoundRows, error: lastRoundErr } = await supabase
      .from("tournament_round_rooms")
      .select("round_no")
      .eq("tournament_id", tournamentId)
      .order("round_no", { ascending: false })
      .limit(1);

    if (lastRoundErr || !lastRoundRows?.length) {
      return NextResponse.json({ winners: [] as TournamentWinner[] });
    }

    const lastRoundNo = (lastRoundRows[0] as { round_no?: number | null }).round_no;
    if (lastRoundNo == null) {
      return NextResponse.json({ winners: [] as TournamentWinner[] });
    }

    const { data: finalRooms, error: finalRoomsErr } = await supabase
      .from("tournament_round_rooms")
      .select("room_id")
      .eq("tournament_id", tournamentId)
      .eq("round_no", lastRoundNo)
      .not("room_id", "is", null);

    if (finalRoomsErr || !finalRooms?.length) {
      return NextResponse.json({ winners: [] as TournamentWinner[] });
    }

    const roomIds = (finalRooms as { room_id?: string | null }[])
      .map((row) => row.room_id)
      .filter(Boolean) as string[];

    if (roomIds.length === 0) {
      return NextResponse.json({ winners: [] as TournamentWinner[] });
    }

    const { data: roomWinners, error: roomWinnersErr } = await supabase
      .from("room_winners")
      .select("user_id, weight")
      .in("room_id", roomIds);

    if (roomWinnersErr || !roomWinners?.length) {
      return NextResponse.json({ winners: [] as TournamentWinner[] });
    }

    const unique = new Map<string, number>();
    for (const row of roomWinners as { user_id?: string | null; weight?: number | null }[]) {
      const userId = row.user_id;
      if (!userId) continue;
      const weight = Number(row.weight ?? 0);
      const existing = unique.get(userId);
      if (existing == null || weight > existing) unique.set(userId, weight);
    }

    const userIds = Array.from(unique.keys());
    const names = await loadNamesByUserId(supabase, userIds);
    const winners: TournamentWinner[] = Array.from(unique.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([userId, _weight], idx) => ({
        userId,
        name: names.get(userId) || "بازیکن",
        rank: idx + 1,
        amount: null,
      }));

    return NextResponse.json({ winners });
  } catch (err: unknown) {
    console.error("[Tournament] winners API error", err);
    const message =
      err instanceof Error ? err.message : "Failed to load tournament winners.";
    return NextResponse.json(
      { error: "internal_error", message },
      { status: 500 }
    );
  }
}
