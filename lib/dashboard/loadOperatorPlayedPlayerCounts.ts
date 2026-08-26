import type { SupabaseClient } from "@supabase/supabase-js";
import { pgPool } from "@/lib/pg";
import {
  dateIsoFromUtcDate,
  getRollingMonthStart,
  getRollingWeekStart,
} from "@/lib/dashboard/loadCommissionDailyStats";

export type OperatorPlayedCount = {
  userId: string;
  role: "agent" | "super";
  displayName: string;
  count: number;
};

type PeriodPlayedRow = {
  user_id: string;
  role: string;
  display_name: string;
  day_count: string | number;
  week_count: string | number;
  month_count: string | number;
};

type RangePlayedRow = {
  user_id: string;
  role: string;
  display_name: string;
  played_count: string | number;
};

function normalizeRole(role: string): "agent" | "super" {
  return role === "super" ? "super" : "agent";
}

function toPlayed(
  userId: string,
  role: string,
  displayName: string,
  count: string | number
): OperatorPlayedCount | null {
  const n = Number(count || 0);
  if (!userId || n <= 0) return null;
  return {
    userId,
    role: normalizeRole(role),
    displayName: displayName?.trim() || "پنل",
    count: n,
  };
}

function emptyPeriodCounts(): Record<"day" | "week" | "month", OperatorPlayedCount[]> {
  return { day: [], week: [], month: [] };
}

async function loadPeriodFromPostgres(): Promise<Record<
  "day" | "week" | "month",
  OperatorPlayedCount[]
> | null> {
  if (!pgPool) return null;

  const result = await pgPool.query<PeriodPlayedRow>(
    `
    with b as (
      select now() as n
    ),
    bounds as (
      select
        ((n at time zone 'utc'))::date as day_from,
        ((n - interval '7 days') at time zone 'utc')::date as week_from,
        ((n - interval '30 days') at time zone 'utc')::date as month_from
      from b
    )
    select
      d.operator_id::text as user_id,
      d.operator_role::text as role,
      coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(u.username), ''), 'پنل') as display_name,
      count(distinct d.player_id) filter (where d.stat_date >= bounds.day_from) as day_count,
      count(distinct d.player_id) filter (where d.stat_date >= bounds.week_from) as week_count,
      count(distinct d.player_id) filter (where d.stat_date >= bounds.month_from) as month_count
    from public.operator_player_play_days d
    cross join bounds
    join public.users u on u.id = d.operator_id
    left join public.user_profiles p on p.user_id = d.operator_id
    where u.role in ('agent', 'super')
    group by d.operator_id, d.operator_role, p.nickname, u.username
    `
  );

  const byPeriod = emptyPeriodCounts();
  for (const row of result.rows) {
    const day = toPlayed(row.user_id, row.role, row.display_name, row.day_count);
    const week = toPlayed(row.user_id, row.role, row.display_name, row.week_count);
    const month = toPlayed(row.user_id, row.role, row.display_name, row.month_count);
    if (day) byPeriod.day.push(day);
    if (week) byPeriod.week.push(week);
    if (month) byPeriod.month.push(month);
  }
  return byPeriod;
}

async function loadRangeFromPostgres(
  fromDate: string,
  toDate: string
): Promise<OperatorPlayedCount[] | null> {
  if (!pgPool) return null;

  const result = await pgPool.query<RangePlayedRow>(
    `
    select
      d.operator_id::text as user_id,
      d.operator_role::text as role,
      coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(u.username), ''), 'پنل') as display_name,
      count(distinct d.player_id) as played_count
    from public.operator_player_play_days d
    join public.users u on u.id = d.operator_id
    left join public.user_profiles p on p.user_id = d.operator_id
    where u.role in ('agent', 'super')
      and d.stat_date >= $1::date
      and d.stat_date <= $2::date
    group by d.operator_id, d.operator_role, p.nickname, u.username
    having count(distinct d.player_id) > 0
    `,
    [fromDate, toDate]
  );

  return result.rows
    .map((row) => toPlayed(row.user_id, row.role, row.display_name, row.played_count))
    .filter((row): row is OperatorPlayedCount => row !== null);
}

async function loadRangeFromSupabase(
  supabase: SupabaseClient,
  fromDate: string,
  toDate: string
): Promise<OperatorPlayedCount[]> {
  const pageSize = 1000;
  const playerIdsByOperator = new Map<
    string,
    { role: "agent" | "super"; playerIds: Set<string> }
  >();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("operator_player_play_days")
      .select("operator_id, operator_role, player_id")
      .gte("stat_date", fromDate)
      .lte("stat_date", toDate)
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("[Dashboard] operator played days fallback error:", error.message);
      break;
    }

    const rows = data || [];
    for (const row of rows) {
      const operatorId = String((row as { operator_id?: string }).operator_id || "");
      const playerId = String((row as { player_id?: string }).player_id || "");
      if (!operatorId || !playerId) continue;
      const role = normalizeRole(String((row as { operator_role?: string }).operator_role || ""));
      const current = playerIdsByOperator.get(operatorId);
      if (current) {
        current.playerIds.add(playerId);
        continue;
      }
      playerIdsByOperator.set(operatorId, { role, playerIds: new Set([playerId]) });
    }

    if (rows.length < pageSize) break;
  }

  const operatorIds = [...playerIdsByOperator.keys()];
  if (operatorIds.length === 0) return [];

  const [{ data: users, error: usersError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      supabase.from("users").select("id, username, role").in("id", operatorIds),
      supabase.from("user_profiles").select("user_id, nickname").in("user_id", operatorIds),
    ]);

  if (usersError) {
    console.error("[Dashboard] operator played users lookup error:", usersError.message);
  }
  if (profilesError) {
    console.error("[Dashboard] operator played profiles lookup error:", profilesError.message);
  }

  const nicknameByUserId = new Map(
    (profiles || []).map((row) => [String((row as { user_id: string }).user_id), row.nickname])
  );

  const list: OperatorPlayedCount[] = [];
  for (const user of users || []) {
    const entry = playerIdsByOperator.get(user.id);
    if (!entry || entry.playerIds.size <= 0) continue;
    const roleRaw = String((user as { role?: string }).role || "").toLowerCase();
    if (roleRaw !== "agent" && roleRaw !== "super") continue;
    const nickname = nicknameByUserId.get(user.id);
    list.push({
      userId: user.id,
      role: roleRaw,
      displayName: (nickname || user.username || "پنل").trim() || "پنل",
      count: entry.playerIds.size,
    });
  }
  return list;
}

/**
 * Unique downline players who played in the rolling day/week/month windows.
 * Source of truth: PostgreSQL operator_player_play_days.
 */
export async function loadOperatorPlayedPlayerCountsByPeriod(
  supabase?: SupabaseClient
): Promise<Record<"day" | "week" | "month", OperatorPlayedCount[]>> {
  try {
    const fromPg = await loadPeriodFromPostgres();
    if (fromPg) {
      console.log("[Dashboard] operator played players loaded", {
        source: "postgres",
        day: fromPg.day.length,
        week: fromPg.week.length,
        month: fromPg.month.length,
      });
      return fromPg;
    }
  } catch (err) {
    console.error("[Dashboard] operator played players postgres period error:", err);
  }

  if (!supabase) {
    console.warn("[Dashboard] operator played players fallback skipped: no supabase client");
    return emptyPeriodCounts();
  }

  try {
    const now = new Date();
    const dayDate = dateIsoFromUtcDate(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    );
    const weekDate = dateIsoFromUtcDate(getRollingWeekStart(now));
    const monthDate = dateIsoFromUtcDate(getRollingMonthStart(now));
    const today = dateIsoFromUtcDate(now);

    const [month, week, day] = await Promise.all([
      loadRangeFromSupabase(supabase, monthDate, today),
      loadRangeFromSupabase(supabase, weekDate, today),
      loadRangeFromSupabase(supabase, dayDate, today),
    ]);

    console.log("[Dashboard] operator played players loaded", {
      source: "supabase",
      day: day.length,
      week: week.length,
      month: month.length,
    });
    return { day, week, month };
  } catch (err) {
    console.error("[Dashboard] operator played players supabase period error:", err);
    return emptyPeriodCounts();
  }
}

export async function loadOperatorPlayedPlayerCountsInRange(
  fromIso: string,
  toIso: string,
  supabase?: SupabaseClient
): Promise<OperatorPlayedCount[]> {
  const fromDate = fromIso.slice(0, 10);
  const toDate = toIso.slice(0, 10);

  try {
    const fromPg = await loadRangeFromPostgres(fromDate, toDate);
    if (fromPg) {
      console.log("[Dashboard] operator played players range loaded", {
        source: "postgres",
        count: fromPg.length,
        fromDate,
        toDate,
      });
      return fromPg;
    }
  } catch (err) {
    console.error("[Dashboard] operator played players postgres range error:", err);
  }

  if (!supabase) {
    console.warn("[Dashboard] operator played players range fallback skipped: no supabase client");
    return [];
  }

  try {
    const fromSupabase = await loadRangeFromSupabase(supabase, fromDate, toDate);
    console.log("[Dashboard] operator played players range loaded", {
      source: "supabase",
      count: fromSupabase.length,
      fromDate,
      toDate,
    });
    return fromSupabase;
  } catch (err) {
    console.error("[Dashboard] operator played players supabase range error:", err);
    return [];
  }
}
