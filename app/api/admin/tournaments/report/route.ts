import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import { parsePeriodParams } from "@/lib/platformReports/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);

    if (!["admin", "super", "agent"].includes(session.role)) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی کافی نیست." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "20", 10) || 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 100);
    const offset = (page - 1) * pageSize;

    const parsed = parsePeriodParams(searchParams, "day");
    if ("error" in parsed) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: parsed.error },
        { status: 400 }
      );
    }
    const { from, to } = parsed;

    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    // Admin panel (admin + sub-admins): hide test tournaments from this report.
    // Super/agent report queries stay unchanged.
    const excludeTestTournaments = session.role === "admin";

    let countQuery = supabase
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .eq("status", "finished")
      .gte("updated_at", fromIso)
      .lte("updated_at", toIso);
    let rowsQuery = supabase
      .from("tournaments")
      .select(
        "id,title,status,start_at,updated_at,currency,ticket_price,guaranteed_prize,commission_snapshot_at"
      )
      .eq("status", "finished")
      .gte("updated_at", fromIso)
      .lte("updated_at", toIso)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (excludeTestTournaments) {
      const notTest =
        "meta->is_test_tournament.is.null,meta->is_test_tournament.eq.false";
      countQuery = countQuery.or(notTest);
      rowsQuery = rowsQuery.or(notTest);
    }

    const [{ count, error: countError }, { data: rows, error: rowsError }] = await Promise.all([
      countQuery,
      rowsQuery,
    ]);

    if (countError || rowsError) {
      const message = countError?.message || rowsError?.message || "خطا در دریافت تورنومنت‌ها";
      return NextResponse.json(
        { ok: false, error: "database_error", message },
        { status: 500 }
      );
    }

    const tournaments = (rows || []) as any[];
    const tournamentIds = tournaments.map((t) => String(t.id));

    const entriesByTournament = new Map<string, { count: number; tickets: number; amount: number }>();
    const poolByTournament = new Map<string, number>();
    const baseByTournament = new Map<string, number>();
    const myCommissionByTournament = new Map<string, number>();
    const prizeByTournament = new Map<string, number>();
    const winnerNamesByTournament = new Map<string, string[]>();

    if (tournamentIds.length > 0) {
      const [entriesRes, snapshotsRes, prizesRes] = await Promise.all([
        supabase
          .from("tournament_entries")
          .select("tournament_id,tickets_count,amount")
          .in("tournament_id", tournamentIds),
        supabase
          .from("tournament_commission_snapshots")
          .select("tournament_id,commission_base,amount_to_pool,agent_amount,super_amount,admin_amount,agent_id,super_id")
          .in("tournament_id", tournamentIds),
        supabase
          .from("transactions")
          .select("source_ref,amount,user_id")
          .eq("source_kind", "tournament_prize")
          .eq("type", "win")
          .in("source_ref", tournamentIds),
      ]);

      if (entriesRes.error || snapshotsRes.error || prizesRes.error) {
        const message =
          entriesRes.error?.message ||
          snapshotsRes.error?.message ||
          prizesRes.error?.message ||
          "خطا در دریافت جزئیات گزارش تورنومنت";
        return NextResponse.json(
          { ok: false, error: "database_error", message },
          { status: 500 }
        );
      }

      for (const row of entriesRes.data || []) {
        const tournamentId = String((row as any).tournament_id || "");
        if (!tournamentId) continue;
        const prev = entriesByTournament.get(tournamentId) || { count: 0, tickets: 0, amount: 0 };
        prev.count += 1;
        prev.tickets += Number((row as any).tickets_count || 0);
        prev.amount += Number((row as any).amount || 0);
        entriesByTournament.set(tournamentId, prev);
      }

      for (const row of snapshotsRes.data || []) {
        const tournamentId = String((row as any).tournament_id || "");
        if (!tournamentId) continue;
        const commissionBase = Number((row as any).commission_base || 0);
        const amountToPool = Number((row as any).amount_to_pool || 0);
        baseByTournament.set(tournamentId, (baseByTournament.get(tournamentId) || 0) + commissionBase);
        poolByTournament.set(tournamentId, (poolByTournament.get(tournamentId) || 0) + amountToPool);

        let myCommission = 0;
        if (session.role === "admin") {
          myCommission = Number((row as any).admin_amount || 0);
        } else if (session.role === "agent") {
          const agentId = String((row as any).agent_id || "");
          if (agentId === session.user.id) {
            myCommission = Number((row as any).agent_amount || 0);
          }
        } else if (session.role === "super") {
          const superId = String((row as any).super_id || "");
          if (superId === session.user.id) {
            myCommission = Number((row as any).super_amount || 0);
          }
        }
        if (myCommission > 0) {
          myCommissionByTournament.set(
            tournamentId,
            (myCommissionByTournament.get(tournamentId) || 0) + myCommission
          );
        }
      }

      for (const row of prizesRes.data || []) {
        const tournamentId = String((row as any).source_ref || "");
        if (!tournamentId) continue;
        prizeByTournament.set(
          tournamentId,
          (prizeByTournament.get(tournamentId) || 0) + Number((row as any).amount || 0)
        );
      }

      const winnerUserIds = Array.from(
        new Set(
          (prizesRes.data || [])
            .map((r: any) => String(r.user_id || ""))
            .filter((id: string) => id.length > 0)
        )
      );
      const winnerNameById = new Map<string, string>();
      if (winnerUserIds.length > 0) {
        const { data: usersRows } = await supabase
          .from("users")
          .select("id,username")
          .in("id", winnerUserIds);
        for (const u of usersRows || []) {
          winnerNameById.set(String((u as any).id), String((u as any).username || "نامشخص"));
        }
      }
      const winnerSetByTournament = new Map<string, Set<string>>();
      for (const row of prizesRes.data || []) {
        const tournamentId = String((row as any).source_ref || "");
        if (!tournamentId) continue;
        const userId = String((row as any).user_id || "");
        if (!userId) continue;
        const winnerName = winnerNameById.get(userId) || "نامشخص";
        if (!winnerSetByTournament.has(tournamentId)) {
          winnerSetByTournament.set(tournamentId, new Set<string>());
        }
        winnerSetByTournament.get(tournamentId)!.add(winnerName);
      }
      for (const [tournamentId, nameSet] of winnerSetByTournament.entries()) {
        winnerNamesByTournament.set(tournamentId, Array.from(nameSet));
      }
    }

    const items = tournaments.map((t) => {
      const id = String(t.id);
      const entries = entriesByTournament.get(id) || { count: 0, tickets: 0, amount: 0 };
      const prizePaid = prizeByTournament.get(id) || 0;
      const poolAmount = poolByTournament.get(id) || 0;
      return {
        id,
        title: String(t.title || "بدون عنوان"),
        status: String(t.status || "finished"),
        startAt: t.start_at ? String(t.start_at) : null,
        finishedAt: t.commission_snapshot_at
          ? String(t.commission_snapshot_at)
          : t.updated_at
            ? String(t.updated_at)
            : null,
        currency: t.currency ? String(t.currency) : "IRR",
        ticketPrice: Number(t.ticket_price || 0),
        guaranteedPrize: Number(t.guaranteed_prize || 0),
        entriesCount: entries.count,
        ticketsCount: entries.tickets,
        entriesAmount: entries.amount,
        commissionBase: baseByTournament.get(id) || 0,
        poolAmount,
        prizePaid,
        guaranteeTopup: Math.max(0, prizePaid - poolAmount),
        myCommission: myCommissionByTournament.get(id) || 0,
        winnerNames: winnerNamesByTournament.get(id) || [],
      };
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          items,
          totalCount: Number(count || 0),
          page,
          pageSize,
          viewerRole: session.role,
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
    console.error("[GET /api/admin/tournaments/report] unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}
