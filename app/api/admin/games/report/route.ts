import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";

function getPeriodRange(period: string): { from: Date; to: Date } {
  const now = new Date();

  if (period === "day") {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from, to: now };
  }

  if (period === "week") {
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
    const from = new Date(now.getFullYear(), now.getMonth(), diff);
    return { from, to: now };
  }

  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to: now };
}

export async function GET(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);

    if (!["admin", "super", "agent"].includes(session.role)) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "فقط ادمین/سوپر/ایجنت می‌توانند این گزارش را ببینند." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") || "day").toLowerCase();
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "20", 10) || 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 100);
    const offset = (page - 1) * pageSize;

    let from: Date;
    let to: Date;

    if (period === "range") {
      const fromStr = searchParams.get("from");
      const toStr = searchParams.get("to");
      if (!fromStr || !toStr) {
        return NextResponse.json(
          { ok: false, error: "validation_error", message: "برای بازه، تاریخ از/تا الزامی است." },
          { status: 400 }
        );
      }

      from = new Date(`${fromStr}T00:00:00.000`);
      to = new Date(`${toStr}T23:59:59.999`);
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
        return NextResponse.json(
          { ok: false, error: "validation_error", message: "بازه تاریخ نامعتبر است." },
          { status: 400 }
        );
      }
    } else if (period === "day" || period === "week" || period === "month") {
      const range = getPeriodRange(period);
      from = range.from;
      to = range.to;
    } else {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "period نامعتبر است." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("fn_admin_games_report", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_limit: pageSize,
      p_offset: offset,
    });

    if (error) {
      console.error("[GET /api/admin/games/report] rpc error:", error);
      return NextResponse.json(
        { ok: false, error: "database_error", message: error.message || "خطا در دریافت گزارش بازی‌ها" },
        { status: 500 }
      );
    }

    const rows = (data || []) as any[];
    const totalCount = rows.length > 0 ? Number(rows[0].total_rows || 0) : 0;
    const roomIds = Array.from(
      new Set(
        rows
          .map((r) => String(r.room_id || ""))
          .filter((id) => id.length > 0)
      )
    );

    const winnerNamesByRoom = new Map<string, string[]>();
    const lineWinnerNamesByRoom = new Map<string, string[]>();
    if (roomIds.length > 0) {
      const { data: winnersRows, error: winnersError } = await supabase
        .from("results")
        .select("room_id, user_id, win_type, reward_amount")
        .in("room_id", roomIds)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString());

      if (!winnersError && winnersRows && winnersRows.length > 0) {
        const winnerUserIds = Array.from(
          new Set(
            winnersRows
              .map((w: any) => w.user_id)
              .filter((id: string | null) => !!id)
          )
        ) as string[];

        const { data: usersRows, error: usersError } = await supabase
          .from("users")
          .select("id, username")
          .in("id", winnerUserIds);

        const userNameMap = new Map<string, string>();
        if (!usersError && usersRows) {
          usersRows.forEach((u: any) => {
            userNameMap.set(String(u.id), String(u.username || "نامشخص"));
          });
        }

        const roomToNamesSet = new Map<string, Set<string>>();
        const roomToLineNamesSet = new Map<string, Set<string>>();
        const roomToLineReward = new Map<string, number>();
        const roomToFullReward = new Map<string, number>();
        winnersRows.forEach((w: any) => {
          const roomId = String(w.room_id || "");
          const userId = String(w.user_id || "");
          if (!roomId || !userId) return;
          const username = userNameMap.get(userId) || "نامشخص";
          const reward = Number(w.reward_amount || 0);
          const winType = String(w.win_type || "").toLowerCase();
          if (!roomToNamesSet.has(roomId)) {
            roomToNamesSet.set(roomId, new Set<string>());
          }
          roomToNamesSet.get(roomId)!.add(username);

          if (winType === "line") {
            if (!roomToLineNamesSet.has(roomId)) {
              roomToLineNamesSet.set(roomId, new Set<string>());
            }
            roomToLineNamesSet.get(roomId)!.add(username);
            roomToLineReward.set(roomId, (roomToLineReward.get(roomId) || 0) + reward);
          } else if (winType === "full") {
            roomToFullReward.set(roomId, (roomToFullReward.get(roomId) || 0) + reward);
          }
        });

        roomToNamesSet.forEach((set, roomId) => {
          winnerNamesByRoom.set(roomId, Array.from(set));
        });
        roomToLineNamesSet.forEach((set, roomId) => {
          lineWinnerNamesByRoom.set(roomId, Array.from(set));
        });
        rows.forEach((r: any) => {
          const rid = String(r.room_id || "");
          (r as any).__line_reward = roomToLineReward.get(rid) || 0;
          (r as any).__full_reward = roomToFullReward.get(rid) || 0;
        });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          items: rows.map((r) => ({
            id: String(r.room_id),
            roomId: String(r.room_id),
            roomTitle: String(r.room_title || "نامشخص"),
            roomCode: r.room_code ? String(r.room_code) : null,
            roomAmount: Number(r.room_amount || 0),
            playedAt: String(r.played_at),
            lineWinsCount: Number(r.line_wins_count || 0),
            fullWinsCount: Number(r.full_wins_count || 0),
            totalReward: Number(r.total_reward || 0),
            lineReward: Number((r as any).__line_reward || 0),
            fullReward: Number((r as any).__full_reward || 0),
            winnerNames: winnerNamesByRoom.get(String(r.room_id)) || [],
            lineWinnerNames: lineWinnerNamesByRoom.get(String(r.room_id)) || [],
          })),
          totalCount,
          page,
          pageSize,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err?.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "جلسه معتبر نیست." },
        { status: 401 }
      );
    }
    if (err?.message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی کافی نیست." },
        { status: 403 }
      );
    }
    console.error("[GET /api/admin/games/report] unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}

