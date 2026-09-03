import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import {
  getOpenTehranAccountingWindow,
  getOpenTehranWeekAccountingWindow,
  getTehranInclusiveDateRangeIso,
} from "@/lib/dashboard/tehranAccountingWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveReportWindow(
  period: string,
  fromDate: string | null,
  toDate: string | null
): { fromIso: string; toIso: string } | { error: string } {
  if (period === "day") {
    const { fromIso, toIso } = getOpenTehranAccountingWindow();
    return { fromIso, toIso };
  }

  if (period === "week") {
    const { fromIso, toIso } = getOpenTehranWeekAccountingWindow();
    return { fromIso, toIso };
  }

  if (period === "range") {
    if (!fromDate || !toDate) {
      return { error: "برای بازه، تاریخ از/تا الزامی است." };
    }
    if (fromDate >= toDate) {
      return { error: "بازه تاریخ نامعتبر است. پایان باید بعد از شروع باشد (مرز ۰۸:۰۰ تهران)." };
    }
    const bounds = getTehranInclusiveDateRangeIso(fromDate, toDate);
    if (!bounds) {
      return { error: "بازه تاریخ نامعتبر است. پایان باید بعد از شروع باشد (مرز ۰۸:۰۰ تهران)." };
    }
    return bounds;
  }

  return { error: "period نامعتبر است." };
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

    const windowResult = resolveReportWindow(
      period,
      searchParams.get("from"),
      searchParams.get("to")
    );

    if ("error" in windowResult) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: windowResult.error },
        { status: 400 }
      );
    }

    const { fromIso, toIso } = windowResult;

    console.log("[GamesReport] admin report window", {
      period,
      fromIso,
      toIso,
      source: period === "day" ? "tehran_08:00" : period === "week" ? "tehran_saturday_08:00" : "tehran_range",
    });

    const { data, error } = await supabase.rpc("fn_admin_games_report", {
      p_from: fromIso,
      p_to: toIso,
      p_limit: pageSize,
      p_offset: offset,
    });

    if (error) {
      console.error("[GamesReport] rpc error:", error);
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

    const ticketsCountByRoom = new Map<string, number>();
    const commissionRateByRoom = new Map<string, number>();

    if (roomIds.length > 0) {
      const normalizeRateToPercent = (raw: unknown): number => {
        const n = Number(raw ?? 0);
        if (!Number.isFinite(n) || n <= 0) return 0;
        // Support both storage styles:
        // - decimal (0.1 => 10%)
        // - percent (10 => 10%)
        return n <= 1 ? n * 100 : n;
      };

      const [{ data: ticketsRows, error: ticketsError }, { data: roomRows, error: roomError }] =
        await Promise.all([
          supabase.from("tickets").select("room_id").in("room_id", roomIds),
          supabase
            .from("rooms")
            .select("id, commission_rate, room_template_id")
            .in("id", roomIds),
        ]);

      if (!ticketsError && ticketsRows) {
        ticketsRows.forEach((t: any) => {
          const rid = String(t.room_id || "");
          if (!rid) return;
          ticketsCountByRoom.set(rid, (ticketsCountByRoom.get(rid) || 0) + 1);
        });
      }

      if (!roomError && roomRows) {
        const templateIds = Array.from(
          new Set(
            roomRows
              .map((r: any) => (r.room_template_id ? String(r.room_template_id) : ""))
              .filter((id: string) => id.length > 0)
          )
        );

        const templateRateById = new Map<string, number>();
        if (templateIds.length > 0) {
          const { data: templateRows, error: templateError } = await supabase
            .from("room_templates")
            .select("id, commission_rate")
            .in("id", templateIds);

          if (!templateError && templateRows) {
            templateRows.forEach((rt: any) => {
              templateRateById.set(String(rt.id), normalizeRateToPercent(rt.commission_rate));
            });
          }
        }

        roomRows.forEach((r: any) => {
          const rid = String(r.id || "");
          if (!rid) return;
          const roomRate = r.commission_rate;
          const templateRate =
            r.room_template_id ? templateRateById.get(String(r.room_template_id)) : undefined;
          const effectivePercent =
            roomRate !== null && roomRate !== undefined
              ? normalizeRateToPercent(roomRate)
              : normalizeRateToPercent(templateRate);
          commissionRateByRoom.set(rid, Number.isFinite(effectivePercent) ? effectivePercent : 0);
        });
      }
    }

    const fullWinnerNamesByRoom = new Map<string, string[]>();
    const lineWinnerNamesByRoom = new Map<string, string[]>();
    if (roomIds.length > 0) {
      const { data: winnersRows, error: winnersError } = await supabase
        .from("results")
        .select("room_id, user_id, win_type, reward_amount")
        .in("room_id", roomIds)
        .gte("created_at", fromIso)
        .lte("created_at", toIso);

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
        const userIdToUsernameMap = new Map<string, string>();
        if (!usersError && usersRows) {
          usersRows.forEach((u: any) => {
            const uid = String(u.id);
            const username = String(u.username || "نامشخص");
            userIdToUsernameMap.set(uid, username);
            userNameMap.set(uid, username);
          });
        }

        // Enrich names with nickname when available (username (nickname))
        if (winnerUserIds.length > 0) {
          const { data: profilesRows, error: profilesError } = await supabase
            .from("user_profiles")
            .select("user_id, nickname")
            .in("user_id", winnerUserIds);

          if (!profilesError && profilesRows) {
            for (const p of profilesRows as any[]) {
              const uid = String(p.user_id || "");
              const nickname = String(p.nickname || "").trim();
              const username = userIdToUsernameMap.get(uid);
              if (!uid || !username || !nickname) continue;
              userNameMap.set(uid, `${username} (${nickname})`);
            }
          }
        }

        const roomToFullNamesSet = new Map<string, Set<string>>();
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
          if (winType === "line") {
            if (!roomToLineNamesSet.has(roomId)) {
              roomToLineNamesSet.set(roomId, new Set<string>());
            }
            roomToLineNamesSet.get(roomId)!.add(username);
            roomToLineReward.set(roomId, (roomToLineReward.get(roomId) || 0) + reward);
          } else if (winType === "full") {
            if (!roomToFullNamesSet.has(roomId)) {
              roomToFullNamesSet.set(roomId, new Set<string>());
            }
            roomToFullNamesSet.get(roomId)!.add(username);
            roomToFullReward.set(roomId, (roomToFullReward.get(roomId) || 0) + reward);
          }
        });

        roomToFullNamesSet.forEach((set, roomId) => {
          fullWinnerNamesByRoom.set(roomId, Array.from(set));
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
            ticketsCount: Number(ticketsCountByRoom.get(String(r.room_id)) || 0),
            commissionRatePercent: Number(
              (commissionRateByRoom.get(String(r.room_id)) || 0).toFixed(2)
            ),
            playedAt: String(r.played_at),
            lineWinsCount: Number(r.line_wins_count || 0),
            fullWinsCount: Number(r.full_wins_count || 0),
            totalReward: Number(r.total_reward || 0),
            lineReward: Number((r as any).__line_reward || 0),
            fullReward: Number((r as any).__full_reward || 0),
            winnerNames: fullWinnerNamesByRoom.get(String(r.room_id)) || [],
            fullWinnerNames: fullWinnerNamesByRoom.get(String(r.room_id)) || [],
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
    console.error("[GamesReport] unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}
