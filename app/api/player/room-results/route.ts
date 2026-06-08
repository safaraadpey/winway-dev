import { NextRequest, NextResponse } from "next/server";
import {
  buildDrawVerificationSpec,
  type DrawVerificationSpec,
} from "@/lib/provablyFairDrawSpec";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

type Winner = {
  id: string;
  avatarUrl: string;
  nickname: string;
  prizeAmount: number;
  ticketId?: string;
  drawNumber?: number;
};

type RoomResultsResponse = {
  lineWinners: Winner[];
  fullWinners: Winner[];
  seed: string | null;
  commitHash: string | null;
  drawVerification: DrawVerificationSpec | null;
  isTournament: boolean;
  tournamentId: string | null;
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
    // فقط فیلدهایی که مطمئن هستیم وجود دارند را select می‌کنیم
    const { data: resultRows, error: resultsError } = await supabase
      .from("results")
      .select("user_id, win_type, reward_amount, ticket_id, draw_number")
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
        ticketId: r.ticket_id || undefined,
        drawNumber: r.draw_number ?? undefined,
      };
    };

    const lineWinners = (resultRows || [])
      .filter((r) => r.win_type === "line")
      .map(mapWinner);

    const fullWinners = (resultRows || [])
      .filter((r) => r.win_type === "full")
      .map(mapWinner);

    // As requested: show BOTH room_seed and room_seed_hash without enforcing "finished-only" reveal.
    // (Service role is used here; this intentionally bypasses the security gating RPC.)
    const { data: roomRow, error: roomError } = await supabase
      .from("rooms")
      .select("room_seed, room_seed_hash, room_template_id")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError) {
      console.error("room-results room fetch error:", roomError);
    }
    const seed: string | null = (roomRow as any)?.room_seed ?? null;
    const commitHash: string | null = (roomRow as any)?.room_seed_hash ?? null;
    const roomTemplateId: string | null = (roomRow as any)?.room_template_id ?? null;

    let isTournament = false;
    if (roomTemplateId) {
      const { data: templateRow, error: templateError } = await supabase
        .from("room_templates")
        .select("room_type")
        .eq("id", roomTemplateId)
        .maybeSingle();
      if (templateError) {
        console.error("room-results template fetch error:", templateError);
      }
      isTournament = (templateRow as any)?.room_type === "tournament";
    }

    const { data: drawRows, error: drawsError } = await supabase
      .from("draws")
      .select("number")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });
    if (drawsError) {
      console.error("room-results draws fetch error:", drawsError);
    }
    const drawnNumbers = (drawRows || [])
      .map((d) => Number(d.number))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 90);

    const drawVerification = buildDrawVerificationSpec({
      roomId,
      serverSeedRaw: seed,
      serverSeedHash: commitHash,
      drawnNumbers,
    });

    let tournamentId: string | null = null;
    if (isTournament) {
      const { data: trrRow, error: trrError } = await supabase
        .from("tournament_round_rooms")
        .select("tournament_id")
        .eq("room_id", roomId)
        .limit(1)
        .maybeSingle();
      if (trrError) {
        console.error("room-results tournament lookup error:", trrError);
      }
      tournamentId = (trrRow as any)?.tournament_id ?? null;
    }

    const payload: RoomResultsResponse = {
      lineWinners,
      fullWinners,
      seed,
      commitHash,
      drawVerification,
      isTournament,
      tournamentId,
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
