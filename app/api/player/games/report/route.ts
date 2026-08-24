import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

type ReportRow = {
  room_id: string;
  room_title: string;
  room_code: string | null;
  room_amount: string | number;
  played_at: string;
  line_wins_count: string | number;
  full_wins_count: string | number;
  total_reward: string | number;
  my_tickets_count: string | number;
  my_total_reward: string | number;
  my_line_reward: string | number;
  my_full_reward: string | number;
  total_rows: string | number;
};

type WinnerRow = {
  room_id: string;
  user_id: string;
  win_type: string;
  reward_amount: string | number;
  username: string | null;
  nickname: string | null;
};

function displayName(username: string | null, nickname: string | null): string {
  const u = String(username || "نامشخص").trim() || "نامشخص";
  const n = String(nickname || "").trim();
  return n ? `${u} (${n})` : u;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    if (!pgPool) {
      return NextResponse.json(
        { ok: false, error: "db_unavailable", message: "پایگاه‌داده در دسترس نیست." },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "20", 10) || 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 50);
    const offset = (page - 1) * pageSize;

    const to = new Date();
    const from = new Date(to.getTime() - ROLLING_WINDOW_MS);

    console.log("[Room] player games report load", {
      userId: user.id,
      from: from.toISOString(),
      to: to.toISOString(),
      page,
      pageSize,
    });

    const { rows } = await pgPool.query<ReportRow>(
      `
      WITH player_rooms AS (
        SELECT DISTINCT t.room_id
        FROM public.tickets t
        WHERE t.player_user_id = $1::uuid
      ),
      grouped AS (
        SELECT
          r.room_id,
          MAX(r.created_at) AS played_at,
          COUNT(*) FILTER (WHERE lower(coalesce(r.win_type, '')) = 'line')::bigint AS line_wins_count,
          COUNT(*) FILTER (WHERE lower(coalesce(r.win_type, '')) = 'full')::bigint AS full_wins_count,
          COALESCE(SUM(r.reward_amount), 0)::numeric AS total_reward
        FROM public.results r
        INNER JOIN player_rooms pr ON pr.room_id = r.room_id
        WHERE r.created_at >= $2::timestamptz
          AND r.created_at <= $3::timestamptz
        GROUP BY r.room_id
      ),
      enriched AS (
        SELECT
          g.room_id,
          COALESCE(
            NULLIF(trim(rm.title), ''),
            NULLIF(trim(rm.room_code), ''),
            concat('room-', left(g.room_id::text, 8))
          )::text AS room_title,
          rm.room_code::text AS room_code,
          COALESCE(rm.price, rm.card_price, 0)::numeric AS room_amount,
          g.played_at,
          g.line_wins_count,
          g.full_wins_count,
          g.total_reward,
          (
            SELECT COUNT(*)::bigint
            FROM public.tickets tk
            WHERE tk.room_id = g.room_id
              AND tk.player_user_id = $1::uuid
          ) AS my_tickets_count,
          COALESCE((
            SELECT SUM(rw.reward_amount)
            FROM public.results rw
            WHERE rw.room_id = g.room_id
              AND rw.user_id = $1::uuid
          ), 0)::numeric AS my_total_reward,
          COALESCE((
            SELECT SUM(rw.reward_amount)
            FROM public.results rw
            WHERE rw.room_id = g.room_id
              AND rw.user_id = $1::uuid
              AND lower(coalesce(rw.win_type, '')) = 'line'
          ), 0)::numeric AS my_line_reward,
          COALESCE((
            SELECT SUM(rw.reward_amount)
            FROM public.results rw
            WHERE rw.room_id = g.room_id
              AND rw.user_id = $1::uuid
              AND lower(coalesce(rw.win_type, '')) = 'full'
          ), 0)::numeric AS my_full_reward
        FROM grouped g
        LEFT JOIN public.rooms rm ON rm.id = g.room_id
      ),
      counted AS (
        SELECT
          e.*,
          COUNT(*) OVER ()::bigint AS total_rows
        FROM enriched e
      )
      SELECT
        c.room_id,
        c.room_title,
        c.room_code,
        c.room_amount,
        c.played_at,
        c.line_wins_count,
        c.full_wins_count,
        c.total_reward,
        c.my_tickets_count,
        c.my_total_reward,
        c.my_line_reward,
        c.my_full_reward,
        c.total_rows
      FROM counted c
      ORDER BY c.played_at DESC
      LIMIT $4
      OFFSET $5
      `,
      [user.id, from.toISOString(), to.toISOString(), pageSize, offset]
    );

    const totalCount = rows.length > 0 ? Number(rows[0].total_rows || 0) : 0;
    const roomIds = rows.map((r) => String(r.room_id));

    const lineRewardByRoom = new Map<string, number>();
    const fullRewardByRoom = new Map<string, number>();
    const fullWinnerNamesByRoom = new Map<string, string[]>();
    const lineWinnerNamesByRoom = new Map<string, string[]>();

    if (roomIds.length > 0) {
      const { rows: winnerRows } = await pgPool.query<WinnerRow>(
        `
        SELECT
          r.room_id,
          r.user_id,
          lower(coalesce(r.win_type, '')) AS win_type,
          r.reward_amount,
          u.username,
          up.nickname
        FROM public.results r
        LEFT JOIN public.users u ON u.id = r.user_id
        LEFT JOIN public.user_profiles up ON up.user_id = r.user_id
        WHERE r.room_id = ANY($1::uuid[])
          AND r.created_at >= $2::timestamptz
          AND r.created_at <= $3::timestamptz
          AND lower(coalesce(r.win_type, '')) IN ('line', 'full')
        `,
        [roomIds, from.toISOString(), to.toISOString()]
      );

      const fullSets = new Map<string, Set<string>>();
      const lineSets = new Map<string, Set<string>>();

      for (const w of winnerRows) {
        const roomId = String(w.room_id);
        const name = displayName(w.username, w.nickname);
        const reward = Number(w.reward_amount || 0);
        const winType = String(w.win_type || "").toLowerCase();

        if (winType === "line") {
          if (!lineSets.has(roomId)) lineSets.set(roomId, new Set());
          lineSets.get(roomId)!.add(name);
          lineRewardByRoom.set(roomId, (lineRewardByRoom.get(roomId) || 0) + reward);
        } else if (winType === "full") {
          if (!fullSets.has(roomId)) fullSets.set(roomId, new Set());
          fullSets.get(roomId)!.add(name);
          fullRewardByRoom.set(roomId, (fullRewardByRoom.get(roomId) || 0) + reward);
        }
      }

      fullSets.forEach((set, roomId) => {
        fullWinnerNamesByRoom.set(roomId, Array.from(set));
      });
      lineSets.forEach((set, roomId) => {
        lineWinnerNamesByRoom.set(roomId, Array.from(set));
      });
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          items: rows.map((r) => {
            const roomId = String(r.room_id);
            return {
              id: roomId,
              roomId,
              roomTitle: String(r.room_title || "نامشخص"),
              roomCode: r.room_code ? String(r.room_code) : null,
              roomAmount: Number(r.room_amount || 0),
              myTicketsCount: Number(r.my_tickets_count || 0),
              playedAt: String(r.played_at),
              lineWinsCount: Number(r.line_wins_count || 0),
              fullWinsCount: Number(r.full_wins_count || 0),
              totalReward: Number(r.total_reward || 0),
              lineReward: lineRewardByRoom.get(roomId) || 0,
              fullReward: fullRewardByRoom.get(roomId) || 0,
              myTotalReward: Number(r.my_total_reward || 0),
              myLineReward: Number(r.my_line_reward || 0),
              myFullReward: Number(r.my_full_reward || 0),
              fullWinnerNames: fullWinnerNamesByRoom.get(roomId) || [],
              lineWinnerNames: lineWinnerNamesByRoom.get(roomId) || [],
            };
          }),
          totalCount,
          page,
          pageSize,
          windowFrom: from.toISOString(),
          windowTo: to.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/player/games/report] unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: message || "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}
