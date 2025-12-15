import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

type Winner = {
  id: string;
  avatarUrl: string;
  nickname: string;
  prizeAmount: number;
};

type RoomResultsResponse = {
  lineWinners: Winner[];
  fullWinners: Winner[];
};

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId");

    if (!roomId) {
      return NextResponse.json(
        { error: "missing_parameters", message: "roomId is required" },
        { status: 400 }
      );
    }

    // Auth اختیاری؛ خطای auth مانع پاسخ نمی‌شود
    try {
      await getUserFromRequest(request);
    } catch (err) {
      console.error("room-results auth error:", err);
    }

    const supabase = createServiceClient();

    // گرفتن نتایج بر اساس جدول results
    const { data: resultRows, error: resultsError } = await supabase
      .from("results")
      .select("user_id, win_type, reward_amount")
      .eq("room_id", roomId);

    if (resultsError) {
      console.error("room-results fetch error:", resultsError);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load room results" },
        { status: 500 }
      );
    }

    const userIds = Array.from(
      new Set((resultRows || []).map((r) => r.user_id).filter(Boolean))
    ) as string[];

    const { data: userRows, error: usersError } = userIds.length
      ? await supabase
          .from("users")
          .select("id, username, user_profiles(nickname, avatar_url)")
          .in("id", userIds)
      : { data: [], error: null };

    if (usersError) {
      console.error("room-results users fetch error:", usersError);
    }

    const userMap = new Map<
      string,
      { nickname: string | null; username: string | null; avatarUrl: string | null }
    >();
    (userRows || []).forEach((u: any) => {
      const profile = Array.isArray(u.user_profiles)
        ? u.user_profiles[0]
        : u.user_profiles;
      userMap.set(u.id, {
        nickname: profile?.nickname ?? null,
        username: u.username ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      });
    });

    const mapWinner = (r: any) => {
      const info = userMap.get(r.user_id) || { nickname: null, username: null, avatarUrl: null };
      const displayName = info.nickname || info.username || r.user_id || "player";
      return {
        id: r.user_id,
        avatarUrl: info.avatarUrl || "",
        nickname: displayName,
        prizeAmount: Number(r.reward_amount || 0),
      };
    };

    const lineWinners = (resultRows || [])
      .filter((r) => r.win_type === "line")
      .map(mapWinner);

    const fullWinners = (resultRows || [])
      .filter((r) => r.win_type === "full")
      .map(mapWinner);

    const payload: RoomResultsResponse = {
      lineWinners,
      fullWinners,
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("GET /api/player/room-results error:", err);
    return NextResponse.json(
      { error: "internal_error", message: err?.message || "Failed to load room results" },
      { status: 500 }
    );
  }
}
