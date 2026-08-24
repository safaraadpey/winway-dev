import type { SupabaseClient } from "@supabase/supabase-js";
import { pgPool } from "@/lib/pg";
import {
  dateIsoFromUtcDate,
  getRollingWeekStart,
  getRollingMonthStart,
  loadPanelOperatorDailyRows,
  type PanelOperatorDailyRow,
} from "@/lib/dashboard/loadCommissionDailyStats";
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
    .filter((op) => op.amount > 0)
    .sort(
      (a, b) => b.amount - a.amount || a.displayName.localeCompare(b.displayName, "fa")
    );
}

function toOperator(
  userId: string,
  role: string,
  displayName: string,
  amount: string | number
): DashboardPanelOperator {
  return {
    userId,
    displayName: displayName?.trim() || "پنل",
    role: normalizeRole(role),
    amount: Number(amount || 0),
  };
}

function monthStartDateUtc(): string {
  return dateIsoFromUtcDate(getRollingMonthStart());
}

function dayStartDateUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function weekStartDateUtc(): string {
  return dateIsoFromUtcDate(getRollingWeekStart());
}

function collectPanelAmounts(
  rows: PanelOperatorDailyRow[],
  fromDate: string,
  toDate?: string
): Map<string, { role: "agent" | "super"; amount: number }> {
  const map = new Map<string, { role: "agent" | "super"; amount: number }>();

  for (const row of rows) {
    if (row.stat_date < fromDate) continue;
    if (toDate && row.stat_date > toDate) continue;

    const userId = String(row.user_id);
    const role = normalizeRole(String(row.role));
    const amount = Number(row.earned_amount || 0);
    if (!userId || amount <= 0) continue;

    const current = map.get(userId);
    if (current) {
      current.amount += amount;
      continue;
    }
    map.set(userId, { role, amount });
  }

  return map;
}

async function loadPeriodFromPostgres(): Promise<Record<
  Exclude<DashboardPeriod, "overall">,
  DashboardPanelOperator[]
> | null> {
  if (!pgPool) return null;

  const result = await pgPool.query<PeriodAmountRow>(
    `
    select
      s.user_id::text as user_id,
      s.role::text as role,
      coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(u.username), ''), 'پنل') as display_name,
      coalesce(sum(s.earned_amount) filter (where s.stat_date >= date_trunc('day', now())::date), 0) as day_amount,
      coalesce(sum(s.earned_amount) filter (where s.stat_date >= (now() - interval '7 days')::date), 0) as week_amount,
      coalesce(sum(s.earned_amount) filter (where s.stat_date >= (now() - interval '30 days')::date), 0) as month_amount
    from public.commission_daily_stats s
    join public.users u on u.id = s.user_id
    left join public.user_profiles p on p.user_id = s.user_id
    where s.stat_date >= (now() - interval '30 days')::date
      and s.earned_amount > 0
      and u.role in ('agent', 'super')
    group by s.user_id, s.role, u.role, p.nickname, u.username
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

  const fromDate = fromIso.slice(0, 10);
  const toDate = toIso.slice(0, 10);

  const result = await pgPool.query<RangeAmountRow>(
    `
    select
      s.user_id::text as user_id,
      s.role::text as role,
      coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(u.username), ''), 'پنل') as display_name,
      coalesce(sum(s.earned_amount), 0) as amount
    from public.commission_daily_stats s
    join public.users u on u.id = s.user_id
    left join public.user_profiles p on p.user_id = s.user_id
    where s.stat_date >= $1::date
      and s.stat_date <= $2::date
      and s.earned_amount > 0
      and u.role in ('agent', 'super')
    group by s.user_id, s.role, u.role, p.nickname, u.username
    having coalesce(sum(s.earned_amount), 0) > 0
    `,
    [fromDate, toDate]
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
    });
  }
  return sortOperators(list);
}

async function loadPeriodFromSupabase(
  supabase: SupabaseClient
): Promise<Record<Exclude<DashboardPeriod, "overall">, DashboardPanelOperator[]>> {
  const monthDate = monthStartDateUtc();
  const rows = await loadPanelOperatorDailyRows({
    supabase,
    fromDate: monthDate,
  });
  const dayDate = dayStartDateUtc();
  const weekDate = weekStartDateUtc();
  const monthAmounts = collectPanelAmounts(rows, monthDate);
  const names = await resolveOperatorNames(supabase, [...monthAmounts.keys()]);

  return {
    day: operatorsFromAmountMap(collectPanelAmounts(rows, dayDate), names),
    week: operatorsFromAmountMap(collectPanelAmounts(rows, weekDate), names),
    month: operatorsFromAmountMap(monthAmounts, names),
  };
}

async function loadRangeFromSupabase(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string
): Promise<DashboardPanelOperator[]> {
  const rows = await loadPanelOperatorDailyRows({
    supabase,
    fromDate: fromIso.slice(0, 10),
    toDate: toIso.slice(0, 10),
  });
  const amounts = collectPanelAmounts(rows, fromIso.slice(0, 10), toIso.slice(0, 10));
  const names = await resolveOperatorNames(supabase, [...amounts.keys()]);
  return operatorsFromAmountMap(amounts, names);
}

/**
 * Per-agent / per-super commission that makes up admin "کانیات پنل‌ها".
 *
 * Source of truth: public.commission_daily_stats (lifetime-safe rollup).
 */
export async function loadPanelCommissionBreakdownByPeriod(
  supabase?: SupabaseClient
): Promise<Record<DashboardPeriod, DashboardPanelOperator[]>> {
  try {
    const fromPg = await loadPeriodFromPostgres();
    if (fromPg) {
      console.log("[Dashboard] panel breakdown loaded", {
        source: "postgres",
        day: fromPg.day.length,
        week: fromPg.week.length,
        month: fromPg.month.length,
      });
      return { ...fromPg, overall: [] };
    }
  } catch (err) {
    console.error("[Dashboard] panel breakdown postgres period error:", err);
  }

  if (!supabase) {
    console.warn("[Dashboard] panel breakdown fallback skipped: no supabase client");
    return { day: [], week: [], month: [], overall: [] };
  }

  try {
    const fromSupabase = await loadPeriodFromSupabase(supabase);
    console.log("[Dashboard] panel breakdown loaded", {
      source: "supabase",
      day: fromSupabase.day.length,
      week: fromSupabase.week.length,
      month: fromSupabase.month.length,
    });
    return { ...fromSupabase, overall: [] };
  } catch (err) {
    console.error("[Dashboard] panel breakdown supabase period error:", err);
    return { day: [], week: [], month: [], overall: [] };
  }
}

export async function loadPanelCommissionBreakdownInRange(
  fromIso: string,
  toIso: string,
  supabase?: SupabaseClient
): Promise<DashboardPanelOperator[]> {
  try {
    const fromPg = await loadRangeFromPostgres(fromIso, toIso);
    if (fromPg) {
      console.log("[Dashboard] panel breakdown range loaded", {
        source: "postgres",
        count: fromPg.length,
        fromIso,
        toIso,
      });
      return fromPg;
    }
  } catch (err) {
    console.error("[Dashboard] panel breakdown postgres range error:", err);
  }

  if (!supabase) {
    console.warn("[Dashboard] panel breakdown range fallback skipped: no supabase client");
    return [];
  }

  try {
    const fromSupabase = await loadRangeFromSupabase(supabase, fromIso, toIso);
    console.log("[Dashboard] panel breakdown range loaded", {
      source: "supabase",
      count: fromSupabase.length,
      fromIso,
      toIso,
    });
    return fromSupabase;
  } catch (err) {
    console.error("[Dashboard] panel breakdown supabase range error:", err);
    return [];
  }
}
