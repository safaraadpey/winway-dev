import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

type NamesResponse = {
  namesByUserId: Record<string, string>;
};

const pickDisplayName = (
  nickname: string | null | undefined,
  username: string | null | undefined,
  email: string | null | undefined
) => {
  const fromEmail = email?.split("@")?.[0]?.trim() || null;
  return (
    nickname?.trim() ||
    username?.trim() ||
    fromEmail ||
    "بازیکن"
  );
};

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const tournamentId = url.searchParams.get("tournamentId");
    if (!tournamentId) {
      return NextResponse.json(
        { error: "missing_parameters", message: "tournamentId is required." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data: entries, error: entriesErr } = await supabase
      .from("tournament_entries")
      .select("user_id")
      .eq("tournament_id", tournamentId)
      .eq("status", "created");

    if (entriesErr) {
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load entries." },
        { status: 500 }
      );
    }

    const userIds = Array.from(
      new Set((entries || []).map((row: any) => row.user_id).filter(Boolean))
    ) as string[];

    if (userIds.length === 0) {
      const empty: NamesResponse = { namesByUserId: {} };
      return NextResponse.json(empty);
    }

    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("id, username, email, user_profiles(nickname)")
      .in("id", userIds);

    if (usersErr) {
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load users." },
        { status: 500 }
      );
    }

    const namesByUserId: Record<string, string> = {};
    (users || []).forEach((u: any) => {
      const profile = Array.isArray(u.user_profiles) ? u.user_profiles[0] : u.user_profiles;
      namesByUserId[u.id] = pickDisplayName(profile?.nickname, u.username, u.email);
    });

    const payload: NamesResponse = { namesByUserId };
    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      { error: "internal_error", message: err?.message || "Failed to load names." },
      { status: 500 }
    );
  }
}

