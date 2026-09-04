import { NextRequest, NextResponse } from "next/server";
import {
  buildDrawVerificationSpec,
  type DrawVerificationSpec,
} from "@/lib/provablyFairDrawSpec";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  cardPrice: number;
  dingSettleMode: "per_draw" | "room_level";
  dingSettled: boolean;
  playerDingAmount: number;
  dingBalanceAfterSettlement: number;
};

type ResultRow = {
  user_id: string;
  win_type: string;
  reward_amount: string | number;
  ticket_id: string | null;
  draw_number: number | null;
};

/**
 * GET /api/player/room-results?roomId=
 * Critical snapshot — Direct PostgreSQL (not Supabase SDK / RLS).
 */
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

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    if (!pgPool) {
      return NextResponse.json(
        { error: "db_unavailable", message: "پایگاه‌داده در دسترس نیست." },
        { status: 503 }
      );
    }

    console.log("[Room] room-results load", { roomId });

    const { rows: resultRows } = await pgPool.query<ResultRow>(
      `
      SELECT user_id, win_type::text AS win_type, reward_amount, ticket_id, draw_number
      FROM public.results
      WHERE room_id = $1::uuid
      ORDER BY draw_number NULLS LAST, created_at ASC
      `,
      [roomId]
    );

    const userIds = Array.from(
      new Set(resultRows.map((r) => r.user_id).filter(Boolean))
    );

    const userMap = new Map<
      string,
      { nickname: string | null; username: string | null; avatarUrl: string | null }
    >();

    if (userIds.length > 0) {
      const { rows: userRows } = await pgPool.query<{
        id: string;
        username: string | null;
        nickname: string | null;
        avatar_url: string | null;
      }>(
        `
        SELECT u.id, u.username, p.nickname, p.avatar_url
        FROM public.users u
        LEFT JOIN public.user_profiles p ON p.user_id = u.id
        WHERE u.id = ANY($1::uuid[])
        `,
        [userIds]
      );
      for (const u of userRows) {
        userMap.set(u.id, {
          nickname: u.nickname ?? null,
          username: u.username ?? null,
          avatarUrl: u.avatar_url ?? null,
        });
      }
    }

    const mapWinner = (r: ResultRow): Winner => {
      const info = userMap.get(r.user_id) || {
        nickname: null,
        username: null,
        avatarUrl: null,
      };
      const displayName =
        info.nickname || info.username || r.user_id || "player";
      return {
        id: r.user_id,
        avatarUrl: info.avatarUrl || "",
        nickname: displayName,
        prizeAmount: Number(r.reward_amount || 0),
        ticketId: r.ticket_id || undefined,
        drawNumber: r.draw_number ?? undefined,
      };
    };

    const lineWinners = resultRows
      .filter((r) => r.win_type === "line")
      .map(mapWinner);
    const fullWinners = resultRows
      .filter((r) => r.win_type === "full")
      .map(mapWinner);

    const { rows: roomRows } = await pgPool.query<{
      room_seed_hex: string | null;
      room_seed_hash: string | null;
      room_template_id: string | null;
      room_type: string | null;
      card_price: string | number | null;
      ding_settle_mode: string | null;
      ding_settled_at: string | null;
      status: string | null;
    }>(
      `
      SELECT
        CASE
          WHEN r.room_seed IS NULL THEN NULL
          ELSE encode(r.room_seed, 'hex')
        END AS room_seed_hex,
        r.room_seed_hash,
        r.room_template_id,
        rt.room_type::text AS room_type,
        r.card_price,
        r.ding_settle_mode::text AS ding_settle_mode,
        r.ding_settled_at::text AS ding_settled_at,
        r.status::text AS status
      FROM public.rooms r
      LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
      WHERE r.id = $1::uuid
      LIMIT 1
      `,
      [roomId]
    );

    const roomRow = roomRows[0];
    const seed = roomRow?.room_seed_hex ?? null;
    const commitHash = roomRow?.room_seed_hash ?? null;
    const isTournament = roomRow?.room_type === "tournament";
    const cardPrice = Number(roomRow?.card_price || 0);
    const dingSettleMode =
      roomRow?.ding_settle_mode === "room_level" ? "room_level" : "per_draw";
    const roomStatus = (roomRow?.status ?? "").toLowerCase();
    const dingSettled =
      dingSettleMode === "room_level"
        ? roomRow?.ding_settled_at != null
        : roomStatus === "finished" ||
          roomStatus === "settling" ||
          roomStatus === "cancelled";

    const { rows: playerDingRows } = await pgPool.query<{ total: string | number }>(
      `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM public.ding_transactions
      WHERE room_id = $1::uuid
        AND user_id = $2::uuid
      `,
      [roomId, user.id]
    );
    const playerDingAmount = Number(playerDingRows[0]?.total ?? 0) || 0;

    const { rows: balanceRows } = await pgPool.query<{ balance: string | number }>(
      `
      SELECT COALESCE(balance, 0) AS balance
      FROM public.ding_balances
      WHERE user_id = $1::uuid
      `,
      [user.id]
    );
    const dingBalanceAfterSettlement = Number(balanceRows[0]?.balance ?? 0) || 0;

    const { rows: drawRows } = await pgPool.query<{ number: number }>(
      `
      SELECT number
      FROM public.draws
      WHERE room_id = $1::uuid
        AND processed_at IS NOT NULL
      ORDER BY processed_at ASC
      `,
      [roomId]
    );

    const drawnNumbers = drawRows
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
      const { rows: trrRows } = await pgPool.query<{ tournament_id: string }>(
        `
        SELECT tournament_id
        FROM public.tournament_round_rooms
        WHERE room_id = $1::uuid
        LIMIT 1
        `,
        [roomId]
      );
      tournamentId = trrRows[0]?.tournament_id ?? null;
    }

    console.log("[Room] room-results ready", {
      roomId,
      lineWinners: lineWinners.length,
      fullWinners: fullWinners.length,
      draws: drawnNumbers.length,
      isTournament,
      cardPrice,
      dingSettleMode,
      dingSettled,
      playerDingAmount,
      dingBalanceAfterSettlement,
    });

    const payload: RoomResultsResponse = {
      lineWinners,
      fullWinners,
      seed,
      commitHash,
      drawVerification,
      isTournament,
      tournamentId,
      cardPrice,
      dingSettleMode,
      dingSettled,
      playerDingAmount,
      dingBalanceAfterSettlement,
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("[Room] GET /api/player/room-results error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        message: err?.message || "Failed to load room results",
      },
      { status: 500 }
    );
  }
}
