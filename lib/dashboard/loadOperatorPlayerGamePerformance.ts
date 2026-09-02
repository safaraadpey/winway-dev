import { pgPool } from "@/lib/pg";
import { loadPerformanceLifetimeStats } from "@/lib/dashboard/loadPerformanceLifetimeStats";
import {
  getLastClosedTehranSnapshotDate,
  getOpenTehranAccountingWindow,
  getTehranMonthSnapshotDateRange,
  getTehranSnapshotDateRangeFromBounds,
  getTehranWeekSnapshotDateRange,
} from "@/lib/dashboard/tehranAccountingWindow";
import {
  emptyOperatorPlayerGamePerformanceByPeriod,
  emptyPlayerGamePerformance,
  type OperatorPlayerGamePerformanceByPeriod,
  type OperatorPlayerGameRole,
  type PlayerGamePerformance,
} from "@/lib/dashboard/playerGamePerformance";

export type {
  OperatorPlayerGamePerformanceByPeriod,
  OperatorPlayerGameRole,
  PlayerGamePerformance,
} from "@/lib/dashboard/playerGamePerformance";
export {
  emptyOperatorPlayerGamePerformanceByPeriod,
  emptyPlayerGamePerformance,
} from "@/lib/dashboard/playerGamePerformance";

const CACHE_TTL_MS = 60_000;

type GameTotals = {
  playerWinnings: number;
  playerPurchases: number;
  gamesPlayed: number;
};

type CacheEntry<T> = {
  expiresAt: number;
  data: T;
};

const cache = new Map<string, CacheEntry<unknown>>();

function toAmount(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function cacheSet<T>(key: string, data: T): T {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  return data;
}

function emptyTotals(): GameTotals {
  return { playerWinnings: 0, playerPurchases: 0, gamesPlayed: 0 };
}

function addTotals(a: GameTotals, b: GameTotals): GameTotals {
  return {
    playerWinnings: a.playerWinnings + b.playerWinnings,
    playerPurchases: a.playerPurchases + b.playerPurchases,
    gamesPlayed: a.gamesPlayed + b.gamesPlayed,
  };
}

function totalsToPlayerGamePerformance(t: GameTotals): PlayerGamePerformance {
  return {
    playerWinnings: t.playerWinnings,
    playerPurchases: t.playerPurchases,
    gamesPlayed: t.gamesPlayed,
  };
}

async function loadClosedSnapshotTotals(params: {
  userId: string;
  role: OperatorPlayerGameRole | "player";
  fromSnapshotDate: string;
  throughSnapshotDate: string;
}): Promise<GameTotals> {
  if (!pgPool) return emptyTotals();
  if (params.fromSnapshotDate > params.throughSnapshotDate) return emptyTotals();

  const result = await pgPool.query<{
    player_winnings: number | string;
    player_purchases: number | string;
    games_played: number | string;
  }>(
    `
    SELECT
      COALESCE(SUM(d.player_winnings), 0) AS player_winnings,
      COALESCE(SUM(d.cards_amount), 0) AS player_purchases,
      COALESCE(SUM(d.games_played), 0) AS games_played
    FROM public.performance_daily_stats d
    WHERE d.user_id = $1::uuid
      AND d.role = $2::text
      AND d.snapshot_date >= $3::date
      AND d.snapshot_date <= $4::date
    `,
    [
      params.userId,
      params.role,
      params.fromSnapshotDate,
      params.throughSnapshotDate,
    ]
  );

  const row = result.rows[0];
  return {
    playerWinnings: toAmount(row?.player_winnings),
    playerPurchases: toAmount(row?.player_purchases),
    gamesPlayed: toAmount(row?.games_played),
  };
}

async function loadOperatorLiveTailTotals(params: {
  operatorId: string;
  role: OperatorPlayerGameRole;
  fromIso: string;
  toIso: string;
}): Promise<GameTotals> {
  if (!pgPool) return emptyTotals();

  const result = await pgPool.query<{
    player_winnings: number | string;
    player_purchases: number | string;
  }>(
    `
    WITH normal_rooms AS (
      SELECT r.id
      FROM public.rooms r
      JOIN public.room_templates rt ON rt.id = r.room_template_id
      WHERE rt.room_type = 'normal'
    ),
    downline AS (
      SELECT pa.user_id
      FROM public.player_affiliation pa
      WHERE ($1::text = 'agent' AND pa.agent_id = $2::uuid)
         OR ($1::text = 'super' AND pa.super_id = $2::uuid)
    ),
    wins AS (
      SELECT COALESCE(SUM(res.reward_amount), 0) AS player_winnings
      FROM public.results res
      WHERE res.user_id IN (SELECT user_id FROM downline)
        AND res.paid_at IS NOT NULL
        AND res.room_id IN (SELECT id FROM normal_rooms)
        AND res.created_at >= $3::timestamptz
        AND res.created_at <= $4::timestamptz
    ),
    purchases AS (
      SELECT COALESCE(SUM(rm.card_price), 0) AS player_purchases
      FROM public.tickets t
      JOIN public.rooms rm ON rm.id = t.room_id
      WHERE t.player_user_id IN (SELECT user_id FROM downline)
        AND t.reservation_status IN ('confirmed', 'consumed')
        AND t.room_id IN (SELECT id FROM normal_rooms)
        AND t.created_at >= $3::timestamptz
        AND t.created_at <= $4::timestamptz
    )
    SELECT w.player_winnings, p.player_purchases
    FROM wins w
    CROSS JOIN purchases p
    `,
    [params.role, params.operatorId, params.fromIso, params.toIso]
  );

  const row = result.rows[0];
  return {
    playerWinnings: toAmount(row?.player_winnings),
    playerPurchases: toAmount(row?.player_purchases),
    gamesPlayed: 0,
  };
}

async function loadPlayerLiveTailTotals(params: {
  playerId: string;
  fromIso: string;
  toIso: string;
}): Promise<GameTotals> {
  if (!pgPool) return emptyTotals();

  const result = await pgPool.query<{
    player_winnings: number | string;
    player_purchases: number | string;
    games_played: number | string;
  }>(
    `
    WITH normal_rooms AS (
      SELECT r.id
      FROM public.rooms r
      JOIN public.room_templates rt ON rt.id = r.room_template_id
      WHERE rt.room_type = 'normal'
    ),
    wins AS (
      SELECT COALESCE(SUM(res.reward_amount), 0) AS player_winnings
      FROM public.results res
      WHERE res.user_id = $1::uuid
        AND res.paid_at IS NOT NULL
        AND res.room_id IN (SELECT id FROM normal_rooms)
        AND res.created_at >= $2::timestamptz
        AND res.created_at <= $3::timestamptz
    ),
    purchases AS (
      SELECT COALESCE(SUM(rm.card_price), 0) AS player_purchases
      FROM public.tickets t
      JOIN public.rooms rm ON rm.id = t.room_id
      WHERE t.player_user_id = $1::uuid
        AND t.reservation_status IN ('confirmed', 'consumed')
        AND t.room_id IN (SELECT id FROM normal_rooms)
        AND t.created_at >= $2::timestamptz
        AND t.created_at <= $3::timestamptz
    ),
    games AS (
      SELECT COUNT(DISTINCT t.room_id)::bigint AS games_played
      FROM public.tickets t
      WHERE t.player_user_id = $1::uuid
        AND t.reservation_status IN ('confirmed', 'consumed')
        AND t.room_id IN (SELECT id FROM normal_rooms)
        AND t.created_at >= $2::timestamptz
        AND t.created_at <= $3::timestamptz
    )
    SELECT w.player_winnings, p.player_purchases, g.games_played
    FROM wins w
    CROSS JOIN purchases p
    CROSS JOIN games g
    `,
    [params.playerId, params.fromIso, params.toIso]
  );

  const row = result.rows[0];
  return {
    playerWinnings: toAmount(row?.player_winnings),
    playerPurchases: toAmount(row?.player_purchases),
    gamesPlayed: toAmount(row?.games_played),
  };
}

async function loadOperatorPeriodTotals(params: {
  operatorId: string;
  role: OperatorPlayerGameRole;
  fromSnapshotDate: string | null;
  throughSnapshotDate: string | null;
  includeLiveTail: boolean;
}): Promise<GameTotals> {
  let closed = emptyTotals();
  if (
    params.fromSnapshotDate &&
    params.throughSnapshotDate &&
    params.fromSnapshotDate <= params.throughSnapshotDate
  ) {
    closed = await loadClosedSnapshotTotals({
      userId: params.operatorId,
      role: params.role,
      fromSnapshotDate: params.fromSnapshotDate,
      throughSnapshotDate: params.throughSnapshotDate,
    });
  }

  if (!params.includeLiveTail) {
    return closed;
  }

  const { fromIso, toIso } = getOpenTehranAccountingWindow();
  const live = await loadOperatorLiveTailTotals({
    operatorId: params.operatorId,
    role: params.role,
    fromIso,
    toIso,
  });

  return addTotals(closed, live);
}

async function loadPlayerPeriodTotals(params: {
  playerId: string;
  fromSnapshotDate: string | null;
  throughSnapshotDate: string | null;
  includeLiveTail: boolean;
}): Promise<GameTotals> {
  let closed = emptyTotals();
  if (
    params.fromSnapshotDate &&
    params.throughSnapshotDate &&
    params.fromSnapshotDate <= params.throughSnapshotDate
  ) {
    closed = await loadClosedSnapshotTotals({
      userId: params.playerId,
      role: "player",
      fromSnapshotDate: params.fromSnapshotDate,
      throughSnapshotDate: params.throughSnapshotDate,
    });
  }

  if (!params.includeLiveTail) {
    return closed;
  }

  const { fromIso, toIso } = getOpenTehranAccountingWindow();
  const live = await loadPlayerLiveTailTotals({
    playerId: params.playerId,
    fromIso,
    toIso,
  });

  return addTotals(closed, live);
}

/**
 * Downline player win/purchase totals for agent or super dashboards.
 * Closed days: operator row on performance_daily_stats.
 * Open accounting day: bounded live tail since last 08:00 Tehran.
 */
export async function loadOperatorPlayerGamePerformanceByPeriod(params: {
  operatorId: string;
  role: OperatorPlayerGameRole;
}): Promise<OperatorPlayerGamePerformanceByPeriod> {
  const cacheKey = `operator-period|${params.operatorId}|${params.role}`;
  const cached = cacheGet<OperatorPlayerGamePerformanceByPeriod>(cacheKey);
  if (cached) {
    console.log("[Dashboard] player game performance loaded", {
      operatorId: params.operatorId,
      role: params.role,
      source: "cache",
    });
    return cached;
  }

  const empty = emptyOperatorPlayerGamePerformanceByPeriod();
  if (!pgPool) {
    console.error("[Dashboard] player game performance skipped: no PostgreSQL pool");
    return empty;
  }

  try {
    const weekRange = getTehranWeekSnapshotDateRange();
    const monthRange = getTehranMonthSnapshotDateRange();
    const lastClosed = getLastClosedTehranSnapshotDate();

    const [day, week, month, lifetimeClosed] = await Promise.all([
      loadOperatorPeriodTotals({
        operatorId: params.operatorId,
        role: params.role,
        fromSnapshotDate: null,
        throughSnapshotDate: null,
        includeLiveTail: true,
      }),
      loadOperatorPeriodTotals({
        operatorId: params.operatorId,
        role: params.role,
        fromSnapshotDate: weekRange.fromSnapshotDate,
        throughSnapshotDate: weekRange.throughSnapshotDate,
        includeLiveTail: true,
      }),
      loadOperatorPeriodTotals({
        operatorId: params.operatorId,
        role: params.role,
        fromSnapshotDate: monthRange.fromSnapshotDate,
        throughSnapshotDate: monthRange.throughSnapshotDate,
        includeLiveTail: true,
      }),
      loadPerformanceLifetimeStats({
        userId: params.operatorId,
        role: params.role,
      }),
    ]);

    const overallClosed: GameTotals = {
      playerWinnings: lifetimeClosed.playerWinnings,
      playerPurchases: lifetimeClosed.playerPurchases,
      gamesPlayed: lifetimeClosed.gamesPlayed,
    };

    const { fromIso, toIso } = getOpenTehranAccountingWindow();
    const liveTail = await loadOperatorLiveTailTotals({
      operatorId: params.operatorId,
      role: params.role,
      fromIso,
      toIso,
    });

    const overall = addTotals(overallClosed, liveTail);

    const data: OperatorPlayerGamePerformanceByPeriod = {
      day: totalsToPlayerGamePerformance(day),
      week: totalsToPlayerGamePerformance(week),
      month: totalsToPlayerGamePerformance(month),
      overall: totalsToPlayerGamePerformance(overall),
    };

    console.log("[Dashboard] player game performance loaded", {
      operatorId: params.operatorId,
      role: params.role,
      source: "snapshot+live_tail",
      lastClosedSnapshotDate: lastClosed,
      dayWinnings: data.day.playerWinnings,
      dayPurchases: data.day.playerPurchases,
    });

    return cacheSet(cacheKey, data);
  } catch (error) {
    console.error("[Dashboard] player game performance query failed:", error);
    return empty;
  }
}

export async function loadOperatorPlayerGamePerformanceInRange(params: {
  operatorId: string;
  role: OperatorPlayerGameRole;
  fromIso: string;
  toIso: string;
}): Promise<PlayerGamePerformance> {
  const cacheKey = `operator-range|${params.operatorId}|${params.role}|${params.fromIso}|${params.toIso}`;
  const cached = cacheGet<PlayerGamePerformance>(cacheKey);
  if (cached) {
    console.log("[Dashboard] player game performance range loaded", {
      operatorId: params.operatorId,
      role: params.role,
      source: "cache",
      fromIso: params.fromIso,
      toIso: params.toIso,
    });
    return cached;
  }

  const empty = emptyPlayerGamePerformance();
  if (!pgPool) {
    console.error("[Dashboard] player game performance range skipped: no PostgreSQL pool");
    return empty;
  }

  try {
    const fromDate = params.fromIso.slice(0, 10);
    const toDate = params.toIso.slice(0, 10);
    const snapshotBounds = getTehranSnapshotDateRangeFromBounds(fromDate, toDate);

    let closed = emptyTotals();
    if (snapshotBounds) {
      closed = await loadClosedSnapshotTotals({
        userId: params.operatorId,
        role: params.role,
        fromSnapshotDate: snapshotBounds.fromSnapshotDate,
        throughSnapshotDate: snapshotBounds.throughSnapshotDate,
      });
    }

    const open = getOpenTehranAccountingWindow();
    const openFromMs = Date.parse(open.fromIso);
    const rangeFromMs = Date.parse(params.fromIso);
    const rangeToMs = Date.parse(params.toIso);

    let live = emptyTotals();
    if (rangeToMs >= openFromMs) {
      const liveFromIso =
        rangeFromMs > openFromMs ? params.fromIso : open.fromIso;
      const liveToIso = rangeToMs < Date.parse(open.toIso) ? params.toIso : open.toIso;
      if (Date.parse(liveFromIso) <= Date.parse(liveToIso)) {
        live = await loadOperatorLiveTailTotals({
          operatorId: params.operatorId,
          role: params.role,
          fromIso: liveFromIso,
          toIso: liveToIso,
        });
      }
    }

    const data = totalsToPlayerGamePerformance(addTotals(closed, live));

    console.log("[Dashboard] player game performance range loaded", {
      operatorId: params.operatorId,
      role: params.role,
      source: "snapshot+live_tail",
      fromIso: params.fromIso,
      toIso: params.toIso,
      playerWinnings: data.playerWinnings,
      playerPurchases: data.playerPurchases,
    });

    return cacheSet(cacheKey, data);
  } catch (error) {
    console.error("[Dashboard] player game performance range query failed:", error);
    return empty;
  }
}

export async function loadPlayerGamePerformanceByPeriod(params: {
  playerId: string;
}): Promise<OperatorPlayerGamePerformanceByPeriod> {
  const cacheKey = `player-period|${params.playerId}`;
  const cached = cacheGet<OperatorPlayerGamePerformanceByPeriod>(cacheKey);
  if (cached) {
    console.log("[UserAccount] player game performance loaded", {
      playerId: params.playerId,
      source: "cache",
    });
    return cached;
  }

  const empty = emptyOperatorPlayerGamePerformanceByPeriod();
  if (!pgPool) {
    console.error("[UserAccount] player game performance skipped: no PostgreSQL pool");
    return empty;
  }

  try {
    const weekRange = getTehranWeekSnapshotDateRange();
    const monthRange = getTehranMonthSnapshotDateRange();

    const [day, week, month, lifetime] = await Promise.all([
      loadPlayerPeriodTotals({
        playerId: params.playerId,
        fromSnapshotDate: null,
        throughSnapshotDate: null,
        includeLiveTail: true,
      }),
      loadPlayerPeriodTotals({
        playerId: params.playerId,
        fromSnapshotDate: weekRange.fromSnapshotDate,
        throughSnapshotDate: weekRange.throughSnapshotDate,
        includeLiveTail: true,
      }),
      loadPlayerPeriodTotals({
        playerId: params.playerId,
        fromSnapshotDate: monthRange.fromSnapshotDate,
        throughSnapshotDate: monthRange.throughSnapshotDate,
        includeLiveTail: true,
      }),
      loadPerformanceLifetimeStats({
        userId: params.playerId,
        role: "player",
      }),
    ]);

    const { fromIso, toIso } = getOpenTehranAccountingWindow();
    const liveTail = await loadPlayerLiveTailTotals({
      playerId: params.playerId,
      fromIso,
      toIso,
    });

    const overall = addTotals(
      {
        playerWinnings: lifetime.playerWinnings,
        playerPurchases: lifetime.playerPurchases,
        gamesPlayed: lifetime.gamesPlayed,
      },
      liveTail
    );

    const data: OperatorPlayerGamePerformanceByPeriod = {
      day: totalsToPlayerGamePerformance(day),
      week: totalsToPlayerGamePerformance(week),
      month: totalsToPlayerGamePerformance(month),
      overall: totalsToPlayerGamePerformance(overall),
    };

    console.log("[UserAccount] player game performance loaded", {
      playerId: params.playerId,
      source: "snapshot+live_tail",
      dayWinnings: data.day.playerWinnings,
      dayPurchases: data.day.playerPurchases,
      dayGames: data.day.gamesPlayed,
    });

    return cacheSet(cacheKey, data);
  } catch (error) {
    console.error("[UserAccount] player game performance query failed:", error);
    return empty;
  }
}

export async function loadPlayerGamePerformanceInRange(params: {
  playerId: string;
  fromIso: string;
  toIso: string;
}): Promise<PlayerGamePerformance> {
  const cacheKey = `player-range|${params.playerId}|${params.fromIso}|${params.toIso}`;
  const cached = cacheGet<PlayerGamePerformance>(cacheKey);
  if (cached) return cached;

  const empty = emptyPlayerGamePerformance();
  if (!pgPool) {
    console.error("[UserAccount] player game performance range skipped: no PostgreSQL pool");
    return empty;
  }

  try {
    const fromDate = params.fromIso.slice(0, 10);
    const toDate = params.toIso.slice(0, 10);
    const snapshotBounds = getTehranSnapshotDateRangeFromBounds(fromDate, toDate);

    let closed = emptyTotals();
    if (snapshotBounds) {
      closed = await loadClosedSnapshotTotals({
        userId: params.playerId,
        role: "player",
        fromSnapshotDate: snapshotBounds.fromSnapshotDate,
        throughSnapshotDate: snapshotBounds.throughSnapshotDate,
      });
    }

    const open = getOpenTehranAccountingWindow();
    const openFromMs = Date.parse(open.fromIso);
    const rangeFromMs = Date.parse(params.fromIso);
    const rangeToMs = Date.parse(params.toIso);

    let live = emptyTotals();
    if (rangeToMs >= openFromMs) {
      const liveFromIso =
        rangeFromMs > openFromMs ? params.fromIso : open.fromIso;
      const liveToIso = rangeToMs < Date.parse(open.toIso) ? params.toIso : open.toIso;
      if (Date.parse(liveFromIso) <= Date.parse(liveToIso)) {
        live = await loadPlayerLiveTailTotals({
          playerId: params.playerId,
          fromIso: liveFromIso,
          toIso: liveToIso,
        });
      }
    }

    const data = totalsToPlayerGamePerformance(addTotals(closed, live));

    console.log("[UserAccount] player game performance range loaded", {
      playerId: params.playerId,
      source: "snapshot+live_tail",
      fromIso: params.fromIso,
      toIso: params.toIso,
      playerWinnings: data.playerWinnings,
      playerPurchases: data.playerPurchases,
    });

    return cacheSet(cacheKey, data);
  } catch (error) {
    console.error("[UserAccount] player game performance range query failed:", error);
    return empty;
  }
}
