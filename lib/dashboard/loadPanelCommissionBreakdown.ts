import type { SupabaseClient } from "@supabase/supabase-js";
import { pgPool } from "@/lib/pg";
import { getRollingWeekStart, getRollingMonthStart } from "@/lib/dashboard/loadCommissionDailyStats";
import {
  getOpenTehranAccountingWindow,
  getTehranSnapshotDateRangeFromBounds,
} from "@/lib/dashboard/tehranAccountingWindow";
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
  admin_day_amount?: string | number;
  admin_week_amount?: string | number;
  admin_month_amount?: string | number;
};

type RangeAmountRow = {
  user_id: string;
  role: string;
  display_name: string;
  amount: string | number;
  admin_amount?: string | number;
};

type PanelBreakdownTotals = {
  userId: string;
  role: "agent" | "super";
  displayName: string;
  amount: number;
  adminAmount: number;
};

const RANGE_CACHE_TTL_MS = 60_000;

type RangeCacheEntry = {
  expiresAt: number;
  data: DashboardPanelOperator[];
};

const rangeCache = new Map<string, RangeCacheEntry>();

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
        op.amount > 0 ||
        (op.adminAmount ?? 0) > 0 ||
        (op.playedPlayersCount ?? 0) > 0 ||
        (op.playingPlayersCount ?? 0) > 0
    )
    .sort(
      (a, b) =>
        b.amount - a.amount ||
        (b.adminAmount ?? 0) - (a.adminAmount ?? 0) ||
        (b.playedPlayersCount ?? 0) - (a.playedPlayersCount ?? 0) ||
        a.displayName.localeCompare(b.displayName, "fa")
    );
}

function toOperator(
  userId: string,
  role: string,
  displayName: string,
  amount: string | number,
  playedPlayersCount = 0,
  adminAmount: string | number = 0
): DashboardPanelOperator {
  return {
    userId,
    displayName: displayName?.trim() || "پنل",
    role: normalizeRole(role),
    amount: Number(amount || 0),
    adminAmount: Number(adminAmount || 0),
    playedPlayersCount,
    playingPlayersCount: 0,
  };
}

function rangeCacheGet(key: string): DashboardPanelOperator[] | null {
  const entry = rangeCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    rangeCache.delete(key);
    return null;
  }
  return entry.data;
}

function rangeCacheSet(key: string, data: DashboardPanelOperator[]): DashboardPanelOperator[] {
  rangeCache.set(key, { expiresAt: Date.now() + RANGE_CACHE_TTL_MS, data });
  return data;
}

function toPanelAmount(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mergePanelBreakdownRows(
  closed: PanelBreakdownTotals[],
  live: PanelBreakdownTotals[]
): DashboardPanelOperator[] {
  const byKey = new Map<string, PanelBreakdownTotals>();

  for (const row of [...closed, ...live]) {
    const key = `${row.userId}|${row.role}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row });
      continue;
    }
    existing.amount += row.amount;
    existing.adminAmount += row.adminAmount;
    if (!existing.displayName && row.displayName) {
      existing.displayName = row.displayName;
    }
  }

  return sortOperators(
    [...byKey.values()].map((row) =>
      toOperator(row.userId, row.role, row.displayName, row.amount, 0, row.adminAmount)
    )
  );
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
      adminAmount: 0,
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

function uniqueOperatorIds(...lists: DashboardPanelOperator[][]): string[] {
  return [...new Set(lists.flatMap((list) => list.map((op) => op.userId)))];
}

/** Same >1-as-percent rule as ticket/tournament commission split. */
function normalizeCommissionRate(rate: number | null | undefined): number {
  const value = Number(rate ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

function applyTakesFullSuperCommission(
  operators: DashboardPanelOperator[],
  flaggedAgentIds: Set<string>
): DashboardPanelOperator[] {
  return operators.map((op) => ({
    ...op,
    takesFullSuperCommission: op.role === "agent" && flaggedAgentIds.has(op.userId),
  }));
}

function applyTakesFullSuperCommissionByPeriod(
  byPeriod: Record<DashboardPeriod, DashboardPanelOperator[]>,
  flaggedAgentIds: Set<string>
): Record<DashboardPeriod, DashboardPanelOperator[]> {
  return {
    day: applyTakesFullSuperCommission(byPeriod.day, flaggedAgentIds),
    week: applyTakesFullSuperCommission(byPeriod.week, flaggedAgentIds),
    month: applyTakesFullSuperCommission(byPeriod.month, flaggedAgentIds),
    overall: applyTakesFullSuperCommission(byPeriod.overall, flaggedAgentIds),
  };
}

async function loadTakesFullSuperCommissionIdsFromPostgres(
  userIds: string[]
): Promise<Set<string> | null> {
  if (!pgPool || userIds.length === 0) return userIds.length === 0 ? new Set() : null;

  const result = await pgPool.query<{ agent_id: string }>(
    `
    select a.id::text as agent_id
    from public.users a
    left join public.users p1 on p1.id = a.parent_id
    left join public.users p2 on p2.id = p1.parent_id
    left join public.user_commissions ac on ac.user_id = a.id
    left join public.user_commissions sc on sc.user_id = case
      when p1.role = 'super' then p1.id
      when p2.role = 'super' then p2.id
      else null
    end
    where a.id = any($1::uuid[])
      and a.role = 'agent'
      and (
        case
          when coalesce(sc.super_commission, 0) > 1 then coalesce(sc.super_commission, 0) / 100
          else coalesce(sc.super_commission, 0)
        end
      ) > 0
      and (
        case
          when coalesce(ac.agent_commission, 0) > 1 then coalesce(ac.agent_commission, 0) / 100
          else coalesce(ac.agent_commission, 0)
        end
      ) = (
        case
          when coalesce(sc.super_commission, 0) > 1 then coalesce(sc.super_commission, 0) / 100
          else coalesce(sc.super_commission, 0)
        end
      )
    `,
    [userIds]
  );

  return new Set(result.rows.map((row) => row.agent_id));
}

async function loadTakesFullSuperCommissionIdsFromSupabase(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Set<string>> {
  const flagged = new Set<string>();
  if (userIds.length === 0) return flagged;

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, role, parent_id")
    .in("id", userIds);

  if (usersError) {
    console.error("[Dashboard] full-super-commission users lookup error:", usersError.message);
    return flagged;
  }

  const agents = (users || []).filter((row) => String(row.role || "").toLowerCase() === "agent");
  const parentIds = [
    ...new Set(agents.map((row) => String(row.parent_id || "")).filter(Boolean)),
  ];
  if (agents.length === 0) return flagged;

  const parentById = new Map<
    string,
    { id: string; role: string; parent_id: string | null }
  >();
  if (parentIds.length > 0) {
    const { data: parents, error: parentsError } = await supabase
      .from("users")
      .select("id, role, parent_id")
      .in("id", parentIds);
    if (parentsError) {
      console.error(
        "[Dashboard] full-super-commission parent lookup error:",
        parentsError.message
      );
    }
    for (const parent of parents || []) {
      parentById.set(String(parent.id), {
        id: String(parent.id),
        role: String(parent.role || "").toLowerCase(),
        parent_id: parent.parent_id ? String(parent.parent_id) : null,
      });
    }

    const grandparentIds = [
      ...new Set(
        [...parentById.values()]
          .filter((parent) => parent.role !== "super" && parent.parent_id)
          .map((parent) => parent.parent_id as string)
      ),
    ];
    if (grandparentIds.length > 0) {
      const { data: grandparents, error: grandparentsError } = await supabase
        .from("users")
        .select("id, role, parent_id")
        .in("id", grandparentIds);
      if (grandparentsError) {
        console.error(
          "[Dashboard] full-super-commission grandparent lookup error:",
          grandparentsError.message
        );
      }
      for (const parent of grandparents || []) {
        parentById.set(String(parent.id), {
          id: String(parent.id),
          role: String(parent.role || "").toLowerCase(),
          parent_id: parent.parent_id ? String(parent.parent_id) : null,
        });
      }
    }
  }

  const superIdByAgentId = new Map<string, string>();
  for (const agent of agents) {
    const parent = parentById.get(String(agent.parent_id || ""));
    if (!parent) continue;
    const superUser = parent.role === "super" ? parent : parentById.get(parent.parent_id || "");
    if (!superUser || superUser.role !== "super") continue;
    superIdByAgentId.set(String(agent.id), superUser.id);
  }

  const commissionUserIds = [
    ...new Set([...superIdByAgentId.keys(), ...superIdByAgentId.values()]),
  ];
  if (commissionUserIds.length === 0) return flagged;

  const { data: commissions, error: commissionsError } = await supabase
    .from("user_commissions")
    .select("user_id, agent_commission, super_commission")
    .in("user_id", commissionUserIds);

  if (commissionsError) {
    console.error(
      "[Dashboard] full-super-commission rates lookup error:",
      commissionsError.message
    );
    return flagged;
  }

  const rateByUserId = new Map<string, { agent: number; super: number }>();
  for (const row of commissions || []) {
    rateByUserId.set(String(row.user_id), {
      agent: normalizeCommissionRate(Number((row as { agent_commission?: number }).agent_commission)),
      super: normalizeCommissionRate(Number((row as { super_commission?: number }).super_commission)),
    });
  }

  for (const [agentId, superId] of superIdByAgentId) {
    const agentRate = rateByUserId.get(agentId)?.agent ?? 0;
    const superRate = rateByUserId.get(superId)?.super ?? 0;
    if (superRate > 0 && Math.abs(agentRate - superRate) < 1e-9) {
      flagged.add(agentId);
    }
  }

  return flagged;
}

async function loadTakesFullSuperCommissionIds(
  userIds: string[],
  supabase?: SupabaseClient
): Promise<Set<string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Set();

  try {
    const fromPg = await loadTakesFullSuperCommissionIdsFromPostgres(uniqueIds);
    if (fromPg) {
      console.log("[Dashboard] full-super-commission flags loaded", {
        source: "postgres",
        flagged: fromPg.size,
        operators: uniqueIds.length,
      });
      return fromPg;
    }
  } catch (err) {
    console.error("[Dashboard] full-super-commission postgres error:", err);
  }

  if (!supabase) {
    console.warn("[Dashboard] full-super-commission fallback skipped: no supabase client");
    return new Set();
  }

  try {
    const fromSupabase = await loadTakesFullSuperCommissionIdsFromSupabase(supabase, uniqueIds);
    console.log("[Dashboard] full-super-commission flags loaded", {
      source: "supabase",
      flagged: fromSupabase.size,
      operators: uniqueIds.length,
    });
    return fromSupabase;
  } catch (err) {
    console.error("[Dashboard] full-super-commission supabase error:", err);
    return new Set();
  }
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

/** سهم ادمین به سوپر می‌رسد؛ اگر سوپر نباشد به ایجنت مستقیم. */
function addAdminAttributedEvent(
  events: OperatorEarnedEvent[],
  agentId: string,
  superId: string,
  adminAmount: number,
  createdAt: string
) {
  if (superId) {
    addEvent(events, superId, "super", adminAmount, createdAt);
    return;
  }
  addEvent(events, agentId, "agent", adminAmount, createdAt);
}

function mergePanelAndAdminAmounts(
  panelAmounts: Map<string, { role: "agent" | "super"; amount: number }>,
  adminAmounts: Map<string, { role: "agent" | "super"; amount: number }>,
  names: Map<string, { displayName: string; role: "agent" | "super" }>
): DashboardPanelOperator[] {
  const userIds = new Set([...panelAmounts.keys(), ...adminAmounts.keys()]);
  const list: DashboardPanelOperator[] = [];
  for (const userId of userIds) {
    const meta = names.get(userId);
    const panel = panelAmounts.get(userId);
    const admin = adminAmounts.get(userId);
    const role = meta?.role ?? panel?.role ?? admin?.role;
    if (!meta || !role) continue;
    list.push({
      userId,
      displayName: meta.displayName,
      role,
      amount: panel?.amount ?? 0,
      adminAmount: admin?.amount ?? 0,
      playedPlayersCount: 0,
      playingPlayersCount: 0,
    });
  }
  return sortOperators(list);
}

async function loadOperatorEarnedEventsFromSupabase(
  supabase: SupabaseClient,
  fromIso: string,
  toIso?: string | null
): Promise<{ panel: OperatorEarnedEvent[]; admin: OperatorEarnedEvent[] }> {
  const pageSize = 1000;
  const events: OperatorEarnedEvent[] = [];
  const adminEvents: OperatorEarnedEvent[] = [];

  const pushRow = (row: {
    agent_id?: string | null;
    super_id?: string | null;
    agent_amount?: number | null;
    super_amount?: number | null;
    admin_amount?: number | null;
    created_at?: string | null;
  }) => {
    const createdAt = String(row.created_at || "");
    if (!createdAt) return;
    addEvent(events, String(row.agent_id || ""), "agent", Number(row.agent_amount || 0), createdAt);
    addEvent(events, String(row.super_id || ""), "super", Number(row.super_amount || 0), createdAt);
    addAdminAttributedEvent(
      adminEvents,
      String(row.agent_id || ""),
      String(row.super_id || ""),
      Number(row.admin_amount || 0),
      createdAt
    );
  };

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("commissions_log")
      .select("agent_id, super_id, agent_amount, super_amount, admin_amount, created_at")
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
      .select("agent_id, super_id, agent_amount, super_amount, admin_amount, created_at")
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

  return { panel: events, admin: adminEvents };
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
    panel_events as (
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
    ),
    admin_events as (
      select
        coalesce(c.super_id, c.agent_id) as user_id,
        case when c.super_id is not null then 'super'::text else 'agent'::text end as role,
        c.created_at,
        c.admin_amount as earned
      from public.commissions_log c
      cross join b
      where c.status = 'settled'
        and c.admin_amount > 0
        and coalesce(c.super_id, c.agent_id) is not null
        and c.created_at >= b.n - interval '30 days'
      union all
      select
        coalesce(s.super_id, s.agent_id),
        case when s.super_id is not null then 'super'::text else 'agent'::text end,
        s.created_at,
        s.admin_amount
      from public.tournament_commission_snapshots s
      cross join b
      where s.admin_amount > 0
        and coalesce(s.super_id, s.agent_id) is not null
        and s.created_at >= b.n - interval '30 days'
    ),
    panel_agg as (
      select
        e.user_id,
        e.role,
        coalesce(sum(e.earned) filter (where e.created_at >= date_trunc('day', b.n)), 0) as day_amount,
        coalesce(sum(e.earned) filter (where e.created_at >= b.n - interval '7 days'), 0) as week_amount,
        coalesce(sum(e.earned) filter (where e.created_at >= b.n - interval '30 days'), 0) as month_amount
      from panel_events e
      cross join b
      group by e.user_id, e.role
    ),
    admin_agg as (
      select
        e.user_id,
        e.role,
        coalesce(sum(e.earned) filter (where e.created_at >= date_trunc('day', b.n)), 0) as day_amount,
        coalesce(sum(e.earned) filter (where e.created_at >= b.n - interval '7 days'), 0) as week_amount,
        coalesce(sum(e.earned) filter (where e.created_at >= b.n - interval '30 days'), 0) as month_amount
      from admin_events e
      cross join b
      group by e.user_id, e.role
    )
    select
      coalesce(pa.user_id, aa.user_id)::text as user_id,
      coalesce(pa.role, aa.role)::text as role,
      coalesce(nullif(btrim(pr.nickname), ''), nullif(btrim(u.username), ''), 'پنل') as display_name,
      coalesce(pa.day_amount, 0) as day_amount,
      coalesce(pa.week_amount, 0) as week_amount,
      coalesce(pa.month_amount, 0) as month_amount,
      coalesce(aa.day_amount, 0) as admin_day_amount,
      coalesce(aa.week_amount, 0) as admin_week_amount,
      coalesce(aa.month_amount, 0) as admin_month_amount
    from panel_agg pa
    full outer join admin_agg aa on aa.user_id = pa.user_id
    join public.users u on u.id = coalesce(pa.user_id, aa.user_id)
    left join public.user_profiles pr on pr.user_id = u.id
    where u.role in ('agent', 'super')
    `
  );

  const byPeriod = emptyPeriods();
  for (const row of result.rows) {
    const day = toOperator(
      row.user_id,
      row.role,
      row.display_name,
      row.day_amount,
      0,
      row.admin_day_amount
    );
    const week = toOperator(
      row.user_id,
      row.role,
      row.display_name,
      row.week_amount,
      0,
      row.admin_week_amount
    );
    const month = toOperator(
      row.user_id,
      row.role,
      row.display_name,
      row.month_amount,
      0,
      row.admin_month_amount
    );
    if (day.amount > 0 || (day.adminAmount ?? 0) > 0) byPeriod.day.push(day);
    if (week.amount > 0 || (week.adminAmount ?? 0) > 0) byPeriod.week.push(week);
    if (month.amount > 0 || (month.adminAmount ?? 0) > 0) byPeriod.month.push(month);
  }

  byPeriod.day = sortOperators(byPeriod.day);
  byPeriod.week = sortOperators(byPeriod.week);
  byPeriod.month = sortOperators(byPeriod.month);
  return byPeriod;
}

async function loadClosedPanelBreakdownFromSnapshot(
  fromSnapshotDate: string,
  throughSnapshotDate: string
): Promise<PanelBreakdownTotals[]> {
  if (!pgPool) return [];
  if (fromSnapshotDate > throughSnapshotDate) return [];

  const result = await pgPool.query<RangeAmountRow>(
    `
    SELECT
      d.user_id::text AS user_id,
      d.role::text AS role,
      coalesce(nullif(btrim(pr.nickname), ''), nullif(btrim(u.username), ''), 'پنل') AS display_name,
      CASE
        WHEN d.role = 'agent' THEN COALESCE(SUM(d.agent_amount), 0)
        WHEN d.role = 'super' THEN COALESCE(SUM(d.super_amount), 0)
        ELSE 0
      END AS amount,
      COALESCE(SUM(d.admin_amount), 0) AS admin_amount
    FROM public.performance_daily_stats d
    JOIN public.users u ON u.id = d.user_id
    LEFT JOIN public.user_profiles pr ON pr.user_id = u.id
    WHERE d.role IN ('agent', 'super')
      AND d.snapshot_date >= $1::date
      AND d.snapshot_date <= $2::date
    GROUP BY d.user_id, d.role, u.username, pr.nickname
    HAVING
      CASE
        WHEN d.role = 'agent' THEN COALESCE(SUM(d.agent_amount), 0)
        WHEN d.role = 'super' THEN COALESCE(SUM(d.super_amount), 0)
        ELSE 0
      END > 0
      OR COALESCE(SUM(d.admin_amount), 0) > 0
    `,
    [fromSnapshotDate, throughSnapshotDate]
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    role: normalizeRole(row.role),
    displayName: row.display_name?.trim() || "پنل",
    amount: toPanelAmount(row.amount),
    adminAmount: toPanelAmount(row.admin_amount),
  }));
}

async function loadLivePanelBreakdownTail(
  fromIso: string,
  toIso: string
): Promise<PanelBreakdownTotals[]> {
  if (!pgPool) return [];

  const result = await pgPool.query<RangeAmountRow>(
    `
    with panel_events as (
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
    ),
    admin_events as (
      select
        coalesce(c.super_id, c.agent_id) as user_id,
        case when c.super_id is not null then 'super'::text else 'agent'::text end as role,
        c.admin_amount as earned
      from public.commissions_log c
      where c.status = 'settled'
        and c.admin_amount > 0
        and coalesce(c.super_id, c.agent_id) is not null
        and c.created_at >= $1::timestamptz
        and c.created_at <= $2::timestamptz
      union all
      select
        coalesce(s.super_id, s.agent_id),
        case when s.super_id is not null then 'super'::text else 'agent'::text end,
        s.admin_amount
      from public.tournament_commission_snapshots s
      where s.admin_amount > 0
        and coalesce(s.super_id, s.agent_id) is not null
        and s.created_at >= $1::timestamptz
        and s.created_at <= $2::timestamptz
    ),
    panel_agg as (
      select e.user_id, e.role, coalesce(sum(e.earned), 0) as amount
      from panel_events e
      group by e.user_id, e.role
    ),
    admin_agg as (
      select e.user_id, e.role, coalesce(sum(e.earned), 0) as amount
      from admin_events e
      group by e.user_id, e.role
    )
    select
      coalesce(pa.user_id, aa.user_id)::text as user_id,
      coalesce(pa.role, aa.role)::text as role,
      coalesce(nullif(btrim(pr.nickname), ''), nullif(btrim(u.username), ''), 'پنل') as display_name,
      coalesce(pa.amount, 0) as amount,
      coalesce(aa.amount, 0) as admin_amount
    from panel_agg pa
    full outer join admin_agg aa on aa.user_id = pa.user_id and aa.role = pa.role
    join public.users u on u.id = coalesce(pa.user_id, aa.user_id)
    left join public.user_profiles pr on pr.user_id = u.id
    where u.role in ('agent', 'super')
      and (coalesce(pa.amount, 0) > 0 or coalesce(aa.amount, 0) > 0)
    `,
    [fromIso, toIso]
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    role: normalizeRole(row.role),
    displayName: row.display_name?.trim() || "پنل",
    amount: toPanelAmount(row.amount),
    adminAmount: toPanelAmount(row.admin_amount),
  }));
}

async function loadRangeFromSnapshotAndLiveTail(
  fromIso: string,
  toIso: string
): Promise<DashboardPanelOperator[] | null> {
  if (!pgPool) return null;

  const fromDate = fromIso.slice(0, 10);
  const toDate = toIso.slice(0, 10);
  const snapshotBounds = getTehranSnapshotDateRangeFromBounds(fromDate, toDate);

  let closed: PanelBreakdownTotals[] = [];
  if (snapshotBounds) {
    closed = await loadClosedPanelBreakdownFromSnapshot(
      snapshotBounds.fromSnapshotDate,
      snapshotBounds.throughSnapshotDate
    );
  }

  const open = getOpenTehranAccountingWindow();
  let live: PanelBreakdownTotals[] = [];
  const openFromMs = Date.parse(open.fromIso);
  const rangeToMs = Date.parse(toIso);

  if (rangeToMs >= openFromMs) {
    const rangeFromMs = Date.parse(fromIso);
    const liveFromIso = rangeFromMs > openFromMs ? fromIso : open.fromIso;
    const liveToIso = rangeToMs < Date.parse(open.toIso) ? toIso : open.toIso;
    if (Date.parse(liveFromIso) <= Date.parse(liveToIso)) {
      live = await loadLivePanelBreakdownTail(liveFromIso, liveToIso);
    }
  }

  return mergePanelBreakdownRows(closed, live);
}

async function loadClosedPanelBreakdownFromSupabase(
  supabase: SupabaseClient,
  fromSnapshotDate: string,
  throughSnapshotDate: string
): Promise<PanelBreakdownTotals[]> {
  const { data, error } = await supabase
    .from("performance_daily_stats")
    .select("user_id, role, agent_amount, super_amount, admin_amount")
    .in("role", ["agent", "super"])
    .gte("snapshot_date", fromSnapshotDate)
    .lte("snapshot_date", throughSnapshotDate);

  if (error) {
    console.error("[Dashboard] panel breakdown snapshot fallback error:", error.message);
    return [];
  }

  const byKey = new Map<string, PanelBreakdownTotals>();

  for (const row of data || []) {
    const userId = String((row as { user_id?: string }).user_id ?? "");
    const roleRaw = String((row as { role?: string }).role ?? "");
    if (!userId || (roleRaw !== "agent" && roleRaw !== "super")) continue;

    const role = normalizeRole(roleRaw);
    const key = `${userId}|${role}`;
    const agentAmount = toPanelAmount((row as { agent_amount?: number }).agent_amount);
    const superAmount = toPanelAmount((row as { super_amount?: number }).super_amount);
    const adminAmount = toPanelAmount((row as { admin_amount?: number }).admin_amount);
    const amount = role === "agent" ? agentAmount : superAmount;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { userId, role, displayName: "پنل", amount, adminAmount });
      continue;
    }
    existing.amount += amount;
    existing.adminAmount += adminAmount;
  }

  const rows = [...byKey.values()].filter((row) => row.amount > 0 || row.adminAmount > 0);
  if (rows.length === 0) return [];

  const names = await resolveOperatorNames(
    supabase,
    rows.map((row) => row.userId)
  );
  return rows.map((row) => ({
    ...row,
    displayName: names.get(row.userId)?.displayName ?? row.displayName,
  }));
}

async function loadRangeFromSnapshotAndLiveTailSupabase(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string
): Promise<DashboardPanelOperator[]> {
  const fromDate = fromIso.slice(0, 10);
  const toDate = toIso.slice(0, 10);
  const snapshotBounds = getTehranSnapshotDateRangeFromBounds(fromDate, toDate);

  let closed: PanelBreakdownTotals[] = [];
  if (snapshotBounds) {
    closed = await loadClosedPanelBreakdownFromSupabase(
      supabase,
      snapshotBounds.fromSnapshotDate,
      snapshotBounds.throughSnapshotDate
    );
  }

  const open = getOpenTehranAccountingWindow();
  let live: PanelBreakdownTotals[] = [];
  const openFromMs = Date.parse(open.fromIso);
  const rangeToMs = Date.parse(toIso);

  if (rangeToMs >= openFromMs && pgPool) {
    const rangeFromMs = Date.parse(fromIso);
    const liveFromIso = rangeFromMs > openFromMs ? fromIso : open.fromIso;
    const liveToIso = rangeToMs < Date.parse(open.toIso) ? toIso : open.toIso;
    if (Date.parse(liveFromIso) <= Date.parse(liveToIso)) {
      live = await loadLivePanelBreakdownTail(liveFromIso, liveToIso);
    }
  }

  return mergePanelBreakdownRows(closed, live);
}

async function loadRangeFromPostgres(
  fromIso: string,
  toIso: string
): Promise<DashboardPanelOperator[] | null> {
  return loadRangeFromSnapshotAndLiveTail(fromIso, toIso);
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
  names: Map<string, { displayName: string; role: "agent" | "super" }>,
  adminAmounts?: Map<string, { role: "agent" | "super"; amount: number }>
): DashboardPanelOperator[] {
  if (adminAmounts) {
    return mergePanelAndAdminAmounts(amounts, adminAmounts, names);
  }
  const list: DashboardPanelOperator[] = [];
  for (const [userId, entry] of amounts) {
    const meta = names.get(userId);
    if (!meta) continue;
    list.push({
      userId,
      displayName: meta.displayName,
      role: meta.role,
      amount: entry.amount,
      adminAmount: 0,
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
  const monthAmounts = collectAmountsSince(events.panel, monthIso);
  const monthAdminAmounts = collectAmountsSince(events.admin, monthIso);
  const names = await resolveOperatorNames(supabase, [
    ...monthAmounts.keys(),
    ...monthAdminAmounts.keys(),
  ]);

  return {
    day: operatorsFromAmountMap(
      collectAmountsSince(events.panel, dayIso),
      names,
      collectAmountsSince(events.admin, dayIso)
    ),
    week: operatorsFromAmountMap(
      collectAmountsSince(events.panel, weekIso),
      names,
      collectAmountsSince(events.admin, weekIso)
    ),
    month: operatorsFromAmountMap(monthAmounts, names, monthAdminAmounts),
  };
}

async function loadRangeFromSupabase(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string
): Promise<DashboardPanelOperator[]> {
  return loadRangeFromSnapshotAndLiveTailSupabase(supabase, fromIso, toIso);
}

/**
 * Per-agent / per-super commission that makes up admin "کانیات پنل‌ها",
 * plus adminAmount (کانیات ادمین) attributed to that super or direct agent.
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
  const withPlaying = attachPlayingCountsByPeriod(
    mergePlayedCountsByPeriod(breakdown, played),
    playingCounts
  );
  const flaggedAgentIds = await loadTakesFullSuperCommissionIds(
    uniqueOperatorIds(withPlaying.day, withPlaying.week, withPlaying.month, withPlaying.overall),
    supabase
  );
  return applyTakesFullSuperCommissionByPeriod(withPlaying, flaggedAgentIds);
}

export async function loadPanelCommissionBreakdownInRange(
  fromIso: string,
  toIso: string,
  supabase?: SupabaseClient
): Promise<DashboardPanelOperator[]> {
  const cacheKey = `${fromIso}|${toIso}`;
  const cached = rangeCacheGet(cacheKey);
  if (cached) {
    console.log("[Dashboard] panel breakdown range loaded", {
      source: "cache",
      count: cached.length,
      fromIso,
      toIso,
    });
    const [played, playingCounts] = await Promise.all([
      loadOperatorPlayedPlayerCountsInRange(fromIso, toIso, supabase),
      loadOperatorPlayingPlayerCounts(supabase),
    ]);
    const withPlayed = mergePlayedCounts(cached, played);
    const withPlaying = attachPlayingCounts(withPlayed, playingCounts);
    const flaggedAgentIds = await loadTakesFullSuperCommissionIds(
      uniqueOperatorIds(withPlaying),
      supabase
    );
    return applyTakesFullSuperCommission(withPlaying, flaggedAgentIds);
  }

  const playedPromise = loadOperatorPlayedPlayerCountsInRange(fromIso, toIso, supabase);
  let list: DashboardPanelOperator[] | null = null;
  let source: "snapshot+live_tail" | "supabase" = "snapshot+live_tail";

  try {
    const fromPg = await loadRangeFromPostgres(fromIso, toIso);
    if (fromPg) {
      list = fromPg;
    }
  } catch (err) {
    console.error("[Dashboard] panel breakdown postgres range error:", err);
  }

  if (!list) {
    source = "supabase";
    if (!supabase) {
      console.warn("[Dashboard] panel breakdown range fallback skipped: no supabase client");
      list = [];
    } else {
      try {
        list = await loadRangeFromSupabase(supabase, fromIso, toIso);
      } catch (err) {
        console.error("[Dashboard] panel breakdown supabase range error:", err);
        list = [];
      }
    }
  }

  console.log("[Dashboard] panel breakdown range loaded", {
    source,
    count: list.length,
    fromIso,
    toIso,
  });

  rangeCacheSet(cacheKey, list);

  const [played, playingCounts] = await Promise.all([
    playedPromise,
    loadOperatorPlayingPlayerCounts(supabase),
  ]);
  const withPlaying = attachPlayingCounts(mergePlayedCounts(list, played), playingCounts);
  const flaggedAgentIds = await loadTakesFullSuperCommissionIds(
    uniqueOperatorIds(withPlaying),
    supabase
  );
  return applyTakesFullSuperCommission(withPlaying, flaggedAgentIds);
}
