import type { SupabaseClient } from "@supabase/supabase-js";
import { pgPool } from "@/lib/pg";
import { getRollingWeekStart, getRollingMonthStart } from "@/lib/dashboard/loadCommissionDailyStats";
import {
  loadOperatorPlayedPlayerCountsByPeriod,
  loadOperatorPlayedPlayerCountsInRange,
  type OperatorPlayedCount,
} from "@/lib/dashboard/loadOperatorPlayedPlayerCounts";
import { loadOperatorPlayingPlayerCounts } from "@/lib/dashboard/loadOperatorPlayingPlayerCounts";
import type { DashboardPanelOperator, DashboardPeriod } from "@/src/types/dashboard";

type PeriodAmountRow = {
  user_id: string;
  role: string;
  display_name: string;
  day_amount: string | number;
  week_amount: string | number;
  month_amount: string | number;
};

type RangeAmountRow = {
  user_id: string;
  role: string;
  display_name: string;
  amount: string | number;
};

function emptyPeriods(): Record<Exclude<DashboardPeriod, "overall">, DashboardPanelOperator[]> {
  return { day: [], week: [], month: [] };
}

function normalizeRole(role: string): "agent" | "super" {
  return role === "super" ? "super" : "agent";
}

function sortOperators(list: DashboardPanelOperator[]): DashboardPanelOperator[] {
  return [...list]
    .filter(
      (op) =>
        op.amount > 0 || (op.playedPlayersCount ?? 0) > 0 || (op.playingPlayersCount ?? 0) > 0
    )
    .sort(
      (a, b) =>
        b.amount - a.amount ||
        (b.playedPlayersCount ?? 0) - (a.playedPlayersCount ?? 0) ||
        a.displayName.localeCompare(b.displayName, "fa")
    );
}

function toOperator(
  userId: string,
  role: string,
  displayName: string,
  amount: string | number,
  playedPlayersCount = 0
): DashboardPanelOperator {
  return {
    userId,
    displayName: displayName?.trim() || "پنل",
    role: normalizeRole(role),
    amount: Number(amount || 0),
    playedPlayersCount,
    playingPlayersCount: 0,
  };
}

function mergePlayedCounts(
  operators: DashboardPanelOperator[],
  played: OperatorPlayedCount[]
): DashboardPanelOperator[] {
  const byId = new Map<string, DashboardPanelOperator>();
  for (const op of operators) {
    byId.set(op.userId, { ...op, playedPlayersCount: op.playedPlayersCount ?? 0 });
  }
  for (const row of played) {
    if (row.count <= 0) continue;
    const existing = byId.get(row.userId);
    if (existing) {
      existing.playedPlayersCount = row.count;
      continue;
    }
    byId.set(row.userId, {
      userId: row.userId,
      displayName: row.displayName,
      role: row.role,
      amount: 0,
      playedPlayersCount: row.count,
      playingPlayersCount: 0,
    });
  }
  return sortOperators([...byId.values()]);
}

function attachPlayingCounts(
  operators: DashboardPanelOperator[],
  counts: Map<string, number>
): DashboardPanelOperator[] {
  return sortOperators(
    operators.map((op) => ({
      ...op,
      playingPlayersCount: counts.get(op.userId) ?? 0,
    }))
  );
}

function mergePlayedCountsByPeriod(
  byPeriod: Record<DashboardPeriod, DashboardPanelOperator[]>,
  played: Record<"day" | "week" | "month", OperatorPlayedCount[]>
): Record<DashboardPeriod, DashboardPanelOperator[]> {
  return {
    day: mergePlayedCounts(byPeriod.day, played.day),
    week: mergePlayedCounts(byPeriod.week, played.week),
    month: mergePlayedCounts(byPeriod.month, played.month),
    overall: mergePlayedCounts(byPeriod.overall, []),
  };
}

function attachPlayingCountsByPeriod(
  byPeriod: Record<DashboardPeriod, DashboardPanelOperator[]>,
  counts: Map<string, number>
): Record<DashboardPeriod, DashboardPanelOperator[]> {
  return {
    day: attachPlayingCounts(byPeriod.day, counts),
    week: attachPlayingCounts(byPeriod.week, counts),
    month: attachPlayingCounts(byPeriod.month, counts),
    overall: attachPlayingCounts(byPeriod.overall, counts),
  };
}

type OperatorEarnedEvent = {
  userId: string;
  role: "agent" | "super";
  created_at: string;
  amount: number;
};

function addEarned(
  map: Map<string, { role: "agent" | "super"; amount: number }>,
  userId: string,
  role: "agent" | "super",
  amount: number
) {
  if (!userId || amount <= 0) return;
  const current = map.get(userId);
  if (current) {
    current.amount += amount;
    return;
  }
  map.set(userId, { role, amount });
}

function collectAmountsSince(
  events: OperatorEarnedEvent[],
  fromIso: string,
  toIso?: string
): Map<string, { role: "agent" | "super"; amount: number }> {
  const map = new Map<string, { role: "agent" | "super"; amount: number }>();
  for (const event of events) {
    if (event.created_at < fromIso) continue;
    if (toIso && event.created_at > toIso) continue;
    addEarned(map, event.userId, event.role, event.amount);
  }
  return map;
}

function addEvent(
  events: OperatorEarnedEvent[],
  userId: string,
  role: "agent" | "super",
  amount: number,
  createdAt: string
) {
  if (!userId || amount <= 0) return;
  events.push({ userId, role, created_at: createdAt, amount });
}

async function loadOperatorEarnedEventsFromSupabase(
  supabase: SupabaseClient,
  fromIso: string,
  toIso?: string | null
): Promise<OperatorEarnedEvent[]> {
  const pageSize = 1000;
  const events: OperatorEarnedEvent[] = [];

  const pushRow = (row: {
    agent_id?: string | null;
    super_id?: string | null;
    agent_amount?: number | null;
    super_amount?: number | null;
    created_at?: string | null;
  }) => {
    const createdAt = String(row.created_at || "");
    if (!createdAt) return;
    addEvent(events, String(row.agent_id || ""), "agent", Number(row.agent_amount || 0), createdAt);
    addEvent(events, String(row.super_id || ""), "super", Number(row.super_amount || 0), createdAt);
  };

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("commissions_log")
      .select("agent_id, super_id, agent_amount, super_amount, created_at")
      .eq("status", "settled")
      .gte("created_at", fromIso)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (toIso) query = query.lte("created_at", toIso);
    const { data, error } = await query;
    if (error) {
      console.error("[Dashboard] panel breakdown commissions_log fallback error:", error.message);
      break;
    }
    const rows = data || [];
    for (const row of rows) pushRow(row);
    if (rows.length < pageSize) break;
  }

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("tournament_commission_snapshots")
      .select("agent_id, super_id, agent_amount, super_amount, created_at")
      .gte("created_at", fromIso)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (toIso) query = query.lte("created_at", toIso);
    const { data, error } = await query;
    if (error) {
      console.error("[Dashboard] panel breakdown tournament fallback error:", error.message);
      break;
    }
    const rows = data || [];
    for (const row of rows) pushRow(row);
    if (rows.length < pageSize) break;
  }

  return events;
}

async function loadPeriodFromPostgres(): Promise<Record<
  Exclude<DashboardPeriod, "overall">,
  DashboardPanelOperator[]
> | null> {
  if (!pgPool) return null;

  const result = await pgPool.query<PeriodAmountRow>(
    `
    with b as (
      select now() as n
    ),
    events as (
      select c.agent_id as user_id, 'agent'::text as role, c.created_at, c.agent_amount as earned
      from public.commissions_log c
      cross join b
      where c.status = 'settled'
        and c.agent_id is not null
        and c.agent_amount > 0
        and c.created_at >= b.n - interval '30 days'
      union all
      select c.super_id, 'super', c.created_at, c.super_amount
      from public.commissions_log c
      cross join b
      where c.status = 'settled'
        and c.super_id is not null
        and c.super_amount > 0
        and c.created_at >= b.n - interval '30 days'
      union all
      select s.agent_id, 'agent', s.created_at, s.agent_amount
      from public.tournament_commission_snapshots s
      cross join b
      where s.agent_id is not null
        and s.agent_amount > 0
        and s.created_at >= b.n - interval '30 days'
      union all
      select s.super_id, 'super', s.created_at, s.super_amount
      from public.tournament_commission_snapshots s
      cross join b
      where s.super_id is not null
        and s.super_amount > 0
        and s.created_at >= b.n - interval '30 days'
    )
    select
      e.user_id::text as user_id,
      e.role::text as role,
      coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(u.username), ''), 'پنل') as display_name,
      coalesce(sum(e.earned) filter (where e.created_at >= date_trunc('day', b.n)), 0) as day_amount,
      coalesce(sum(e.earned) filter (where e.created_at >= b.n - interval '7 days'), 0) as week_amount,
      coalesce(sum(e.earned) filter (where e.created_at >= b.n - interval '30 days'), 0) as month_amount
    from events e
    cross join b
    join public.users u on u.id = e.user_id
    left join public.user_profiles p on p.user_id = e.user_id
    where u.role in ('agent', 'super')
    group by e.user_id, e.role, u.role, p.nickname, u.username
    `
  );

  const byPeriod = emptyPeriods();
  for (const row of result.rows) {
    const day = toOperator(row.user_id, row.role, row.display_name, row.day_amount);
    const week = toOperator(row.user_id, row.role, row.display_name, row.week_amount);
    const month = toOperator(row.user_id, row.role, row.display_name, row.month_amount);
    if (day.amount > 0) byPeriod.day.push(day);
    if (week.amount > 0) byPeriod.week.push(week);
    if (month.amount > 0) byPeriod.month.push(month);
  }

  byPeriod.day = sortOperators(byPeriod.day);
  byPeriod.week = sortOperators(byPeriod.week);
  byPeriod.month = sortOperators(byPeriod.month);
  return byPeriod;
}

async function loadRangeFromPostgres(
  fromIso: string,
  toIso: string
): Promise<DashboardPanelOperator[] | null> {
  if (!pgPool) return null;

  const result = await pgPool.query<RangeAmountRow>(
    `
    with events as (
      select c.agent_id as user_id, 'agent'::text as role, c.agent_amount as earned
      from public.commissions_log c
      where c.status = 'settled'
        and c.agent_id is not null
        and c.agent_amount > 0
        and c.created_at >= $1::timestamptz
        and c.created_at <= $2::timestamptz
      union all
      select c.super_id, 'super', c.super_amount
      from public.commissions_log c
      where c.status = 'settled'
        and c.super_id is not null
        and c.super_amount > 0
        and c.created_at >= $1::timestamptz
        and c.created_at <= $2::timestamptz
      union all
      select s.agent_id, 'agent', s.agent_amount
      from public.tournament_commission_snapshots s
      where s.agent_id is not null
        and s.agent_amount > 0
        and s.created_at >= $1::timestamptz
        and s.created_at <= $2::timestamptz
      union all
      select s.super_id, 'super', s.super_amount
      from public.tournament_commission_snapshots s
      where s.super_id is not null
        and s.super_amount > 0
        and s.created_at >= $1::timestamptz
        and s.created_at <= $2::timestamptz
    )
    select
      e.user_id::text as user_id,
      e.role::text as role,
      coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(u.username), ''), 'پنل') as display_name,
      coalesce(sum(e.earned), 0) as amount
    from events e
    join public.users u on u.id = e.user_id
    left join public.user_profiles p on p.user_id = e.user_id
    where u.role in ('agent', 'super')
    group by e.user_id, e.role, u.role, p.nickname, u.username
    having coalesce(sum(e.earned), 0) > 0
    `,
    [fromIso, toIso]
  );

  return sortOperators(
    result.rows.map((row) => toOperator(row.user_id, row.role, row.display_name, row.amount))
  );
}

async function resolveOperatorNames(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, { displayName: string; role: "agent" | "super" }>> {
  const names = new Map<string, { displayName: string; role: "agent" | "super" }>();
  if (userIds.length === 0) return names;

  const [{ data: users, error: usersError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      supabase.from("users").select("id, username, role").in("id", userIds),
      supabase.from("user_profiles").select("user_id, nickname").in("user_id", userIds),
    ]);

  if (usersError) {
    console.error("[Dashboard] panel breakdown users lookup error:", usersError.message);
  }
  if (profilesError) {
    console.error("[Dashboard] panel breakdown profiles lookup error:", profilesError.message);
  }

  const nicknameByUserId = new Map(
    (profiles || []).map((row) => [String((row as { user_id: string }).user_id), row.nickname])
  );

  for (const user of users || []) {
    const roleRaw = String((user as { role?: string }).role || "").toLowerCase();
    if (roleRaw !== "agent" && roleRaw !== "super") continue;
    const nickname = nicknameByUserId.get(user.id);
    names.set(user.id, {
      role: roleRaw,
      displayName: (nickname || user.username || "پنل").trim() || "پنل",
    });
  }

  return names;
}

function operatorsFromAmountMap(
  amounts: Map<string, { role: "agent" | "super"; amount: number }>,
  names: Map<string, { displayName: string; role: "agent" | "super" }>
): DashboardPanelOperator[] {
  const list: DashboardPanelOperator[] = [];
  for (const [userId, entry] of amounts) {
    const meta = names.get(userId);
    if (!meta) continue;
    list.push({
      userId,
      displayName: meta.displayName,
      role: meta.role,
      amount: entry.amount,
      playedPlayersCount: 0,
      playingPlayersCount: 0,
    });
  }
  return sortOperators(list);
}

async function loadPeriodFromSupabase(
  supabase: SupabaseClient
): Promise<Record<Exclude<DashboardPeriod, "overall">, DashboardPanelOperator[]>> {
  const now = new Date();
  const dayIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
  const weekIso = getRollingWeekStart(now).toISOString();
  const monthIso = getRollingMonthStart(now).toISOString();
  const events = await loadOperatorEarnedEventsFromSupabase(supabase, monthIso);
  const monthAmounts = collectAmountsSince(events, monthIso);
  const names = await resolveOperatorNames(supabase, [...monthAmounts.keys()]);

  return {
    day: operatorsFromAmountMap(collectAmountsSince(events, dayIso), names),
    week: operatorsFromAmountMap(collectAmountsSince(events, weekIso), names),
    month: operatorsFromAmountMap(monthAmounts, names),
  };
}

async function loadRangeFromSupabase(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string
): Promise<DashboardPanelOperator[]> {
  const events = await loadOperatorEarnedEventsFromSupabase(supabase, fromIso, toIso);
  const amounts = collectAmountsSince(events, fromIso, toIso);
  const names = await resolveOperatorNames(supabase, [...amounts.keys()]);
  return operatorsFromAmountMap(amounts, names);
}

/**
 * Per-agent / per-super commission that makes up admin "کانیات پنل‌ها".
 *
 * Week/month use the same timestamp windows as the admin dashboard
 * (now()-7d / now()-30d on created_at). Overall still lives in daily rollup.
 */
export async function loadPanelCommissionBreakdownByPeriod(
  supabase?: SupabaseClient
): Promise<Record<DashboardPeriod, DashboardPanelOperator[]>> {
  const playedPromise = loadOperatorPlayedPlayerCountsByPeriod(supabase);
  const empty: Record<DashboardPeriod, DashboardPanelOperator[]> = {
    day: [],
    week: [],
    month: [],
    overall: [],
  };

  let breakdown = empty;
  try {
    const fromPg = await loadPeriodFromPostgres();
    if (fromPg) {
      console.log("[Dashboard] panel breakdown loaded", {
        source: "postgres",
        day: fromPg.day.length,
        week: fromPg.week.length,
        month: fromPg.month.length,
      });
      breakdown = { ...fromPg, overall: [] };
    }
  } catch (err) {
    console.error("[Dashboard] panel breakdown postgres period error:", err);
  }

  if (breakdown === empty) {
    if (!supabase) {
      console.warn("[Dashboard] panel breakdown fallback skipped: no supabase client");
    } else {
      try {
        const fromSupabase = await loadPeriodFromSupabase(supabase);
        console.log("[Dashboard] panel breakdown loaded", {
          source: "supabase",
          day: fromSupabase.day.length,
          week: fromSupabase.week.length,
          month: fromSupabase.month.length,
        });
        breakdown = { ...fromSupabase, overall: [] };
      } catch (err) {
        console.error("[Dashboard] panel breakdown supabase period error:", err);
      }
    }
  }

  const [played, playingCounts] = await Promise.all([
    playedPromise,
    loadOperatorPlayingPlayerCounts(supabase),
  ]);
  return attachPlayingCountsByPeriod(mergePlayedCountsByPeriod(breakdown, played), playingCounts);
}

export async function loadPanelCommissionBreakdownInRange(
  fromIso: string,
  toIso: string,
  supabase?: SupabaseClient
): Promise<DashboardPanelOperator[]> {
  const playedPromise = loadOperatorPlayedPlayerCountsInRange(fromIso, toIso, supabase);
  let list: DashboardPanelOperator[] | null = null;

  try {
    const fromPg = await loadRangeFromPostgres(fromIso, toIso);
    if (fromPg) {
      console.log("[Dashboard] panel breakdown range loaded", {
        source: "postgres",
        count: fromPg.length,
        fromIso,
        toIso,
      });
      list = fromPg;
    }
  } catch (err) {
    console.error("[Dashboard] panel breakdown postgres range error:", err);
  }

  if (!list) {
    if (!supabase) {
      console.warn("[Dashboard] panel breakdown range fallback skipped: no supabase client");
      list = [];
    } else {
      try {
        const fromSupabase = await loadRangeFromSupabase(supabase, fromIso, toIso);
        console.log("[Dashboard] panel breakdown range loaded", {
          source: "supabase",
          count: fromSupabase.length,
          fromIso,
          toIso,
        });
        list = fromSupabase;
      } catch (err) {
        console.error("[Dashboard] panel breakdown supabase range error:", err);
        list = [];
      }
    }
  }

  const [played, playingCounts] = await Promise.all([
    playedPromise,
    loadOperatorPlayingPlayerCounts(supabase),
  ]);
  return attachPlayingCounts(mergePlayedCounts(list, played), playingCounts);
}
