import { NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DingLeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  dingTotal: number;
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
    console.error("[Tournament] ding leaderboard names lookup failed", error);
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
 * GET /api/player/tournament-ding-leaderboard?tournamentId=
 * Returns participants ordered by tournament DING total (PostgreSQL source of truth).
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
      return NextResponse.json({ leaderboard: [] as DingLeaderboardEntry[] });
    }

    const { data: assignments, error: assignmentsErr } = await supabase
      .from("tournament_round_assignments")
      .select("user_id")
      .eq("tournament_id", tournamentId);

    if (assignmentsErr) {
      console.error("[Tournament] ding leaderboard assignments error", assignmentsErr);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load tournament participants." },
        { status: 500 }
      );
    }

    let participantIds = Array.from(
      new Set(
        (assignments || [])
          .map((row: { user_id?: string | null }) => row.user_id)
          .filter(Boolean) as string[]
      )
    );

    if (participantIds.length === 0) {
      const { data: entries, error: entriesErr } = await supabase
        .from("tournament_entries")
        .select("user_id")
        .eq("tournament_id", tournamentId)
        .in("status", ["created", "settled"]);

      if (entriesErr) {
        console.error("[Tournament] ding leaderboard entries error", entriesErr);
        return NextResponse.json(
          { error: "internal_error", message: "Failed to load tournament participants." },
          { status: 500 }
        );
      }

      participantIds = Array.from(
        new Set(
          (entries || [])
            .map((row: { user_id?: string | null }) => row.user_id)
            .filter(Boolean) as string[]
        )
      );
    }

    if (participantIds.length === 0) {
      return NextResponse.json({ leaderboard: [] as DingLeaderboardEntry[] });
    }

    const { data: dingRows, error: dingErr } = await supabase
      .from("tournament_player_ding_totals")
      .select("user_id, ding_total")
      .eq("tournament_id", tournamentId)
      .in("user_id", participantIds);

    if (dingErr) {
      console.error("[Tournament] ding leaderboard totals error", dingErr);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load DING totals." },
        { status: 500 }
      );
    }

    const dingByUser = new Map<string, number>();
    for (const row of dingRows || []) {
      const typed = row as { user_id?: string | null; ding_total?: number | null };
      if (!typed.user_id) continue;
      dingByUser.set(typed.user_id, Number(typed.ding_total ?? 0));
    }

    const sorted = participantIds
      .map((userId) => ({
        userId,
        dingTotal: dingByUser.get(userId) ?? 0,
      }))
      .sort((a, b) => {
        if (b.dingTotal !== a.dingTotal) return b.dingTotal - a.dingTotal;
        return a.userId.localeCompare(b.userId);
      });

    const names = await loadNamesByUserId(
      supabase,
      sorted.map((row) => row.userId)
    );

    let rank = 0;
    let prevDing: number | null = null;
    const leaderboard: DingLeaderboardEntry[] = sorted.map((row, index) => {
      if (prevDing === null || row.dingTotal !== prevDing) {
        rank = index + 1;
      }
      prevDing = row.dingTotal;
      return {
        rank,
        userId: row.userId,
        name: names.get(row.userId) || "بازیکن",
        dingTotal: row.dingTotal,
      };
    });

    return NextResponse.json({ leaderboard });
  } catch (err: unknown) {
    console.error("[Tournament] ding leaderboard API error", err);
    const message =
      err instanceof Error ? err.message : "Failed to load DING leaderboard.";
    return NextResponse.json(
      { error: "internal_error", message },
      { status: 500 }
    );
  }
}
