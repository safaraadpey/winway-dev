/**
 * PG-first loaders for live-room snapshots.
 * Mirrors lib/liveRoomSnapshotPg.ts in the Next.js app.
 */

import { parseGameManifestPayload } from "../domain/replay/parseManifest.js";
import type { GameManifest } from "../domain/replay/types.js";
import { pgPool } from "../db/pg.js";

const LIVE_ROOM_PG_COMPARE_LOG_UNTIL_MS = Date.parse("2026-06-17T23:59:59.999Z");

export type LiveDrawRow = {
  id: string;
  number: number;
  created_at: string;
  processed_at: string;
};

export type LiveTicketRow = {
  id: string;
  player_user_id: string | null;
  pool_card_id: string | null;
  card_no: number | null;
};

export type LiveCardNumberRow = {
  pool_card_id: string;
  row_no: number;
  col_no: number;
  value: number | null;
};

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

export async function loadLiveDrawsFromPg(
  roomId: string
): Promise<LiveDrawRow[] | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<{
      id: string;
      number: number;
      created_at: Date | string;
      processed_at: Date | string;
    }>(
      `
      select
        d.id::text as id,
        d.number,
        d.created_at,
        d.processed_at
      from public.draws d
      where d.room_id = $1::uuid
        and d.processed_at is not null
      order by d.processed_at asc
      `,
      [roomId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      number: row.number,
      created_at: toIso(row.created_at),
      processed_at: toIso(row.processed_at),
    }));
  } catch (err) {
    console.error("[LiveRoom] loadLiveDrawsFromPg error:", err);
    return null;
  }
}

export async function loadLiveTicketsFromPg(
  roomId: string
): Promise<LiveTicketRow[] | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<{
      id: string;
      player_user_id: string | null;
      pool_card_id: string | null;
      card_no: number | null;
    }>(
      `
      select
        t.id::text as id,
        t.player_user_id::text as player_user_id,
        t.pool_card_id::text as pool_card_id,
        t.card_no
      from public.tickets t
      where t.room_id = $1::uuid
        and t.reservation_status in ('reserved','confirmed','consumed')
      `,
      [roomId]
    );

    return result.rows;
  } catch (err) {
    console.error("[LiveRoom] loadLiveTicketsFromPg error:", err);
    return null;
  }
}

export async function loadLiveCardNumbersFromPg(
  poolIds: string[]
): Promise<LiveCardNumberRow[] | null> {
  if (!pgPool) return null;
  if (poolIds.length === 0) return [];

  const poolIdBigints = poolIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));

  if (poolIdBigints.length === 0) return [];

  try {
    const result = await pgPool.query<{
      pool_card_id: string;
      row_no: number;
      col_no: number;
      value: number | null;
    }>(
      `
      select
        cn.pool_card_id::text as pool_card_id,
        cn.row_no,
        cn.col_no,
        cn.value
      from public.card_numbers cn
      where cn.pool_card_id = any($1::bigint[])
      `,
      [poolIdBigints]
    );

    return result.rows;
  } catch (err) {
    console.error("[LiveRoom] loadLiveCardNumbersFromPg error:", err);
    return null;
  }
}

export function logLiveRoomPgCompare(payload: Record<string, unknown>): void {
  if (Date.now() > LIVE_ROOM_PG_COMPARE_LOG_UNTIL_MS) return;

  console.info(
    "[liveRoomSnapshot:pg-vs-supabase]",
    JSON.stringify({
      ...payload,
      debugTs: new Date().toISOString(),
    })
  );
}

export function mapDrawRows(
  rows: Array<{
    id: string;
    number: number;
    created_at: string;
    processed_at: string;
  }>
) {
  return rows.map((d) => ({
    id: d.id,
    number: d.number,
    created_at: d.created_at,
    processed_at: d.processed_at,
  }));
}

export function buildCardNumberMap(
  cardNumbers: LiveCardNumberRow[]
): Map<string, LiveCardNumberRow[]> {
  const cardNumberMap = new Map<string, LiveCardNumberRow[]>();
  for (const cn of cardNumbers) {
    const key = String(cn.pool_card_id);
    if (!cardNumberMap.has(key)) {
      cardNumberMap.set(key, []);
    }
    cardNumberMap.get(key)!.push(cn);
  }
  return cardNumberMap;
}

export function buildLiveRoomCards(
  tickets: LiveTicketRow[],
  cardNumberMap: Map<string, LiveCardNumberRow[]>,
  userMap: Map<string, { username: string | null; nickname: string | null }>,
  currentUserId: string
) {
  return tickets.map((ticket) => {
    const grid = Array.from({ length: 3 }, () =>
      Array(9).fill(null) as Array<number | null>
    );
    const positions = ticket.pool_card_id
      ? cardNumberMap.get(String(ticket.pool_card_id)) || []
      : [];

    for (const pos of positions) {
      const rowIndex = pos.row_no - 1;
      const colIndex = pos.col_no - 1;
      if (rowIndex >= 0 && rowIndex < 3 && colIndex >= 0 && colIndex < 9) {
        grid[rowIndex][colIndex] = pos.value;
      }
    }

    const playerId = ticket.player_user_id || "";
    const displayName =
      userMap.get(playerId)?.nickname ||
      userMap.get(playerId)?.username ||
      playerId ||
      "player";

    return {
      ticket_id: ticket.id,
      player_id: ticket.player_user_id,
      player_name: displayName,
      card_number: ticket.card_no,
      pool_card_id: ticket.pool_card_id,
      card: grid,
      is_my_card: ticket.player_user_id === currentUserId,
    };
  });
}

export type CardPoolVersionMeta = {
  poolId: string;
  commitHash: string;
  prngVersion: string;
  cardCount: number;
};

export type FrozenManifestRoomMeta = {
  roomCode: string | null;
  roomSeedHash: string | null;
  cardPrice: number;
  commissionRate: number;
  lineRewardPercentage: number;
  fullRewardPercentage: number;
  isTournament: boolean;
};

export type LiveTournamentMeta = {
  id: string;
  title: string | null;
  round_no: number | null;
};

export async function loadLiveTournamentForRoomFromPg(
  roomId: string
): Promise<LiveTournamentMeta | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<{
      tournament_id: string;
      round_no: number | null;
      title: string | null;
    }>(
      `
      select
        trr.tournament_id::text as tournament_id,
        trr.round_no,
        t.title
      from public.tournament_round_rooms trr
      left join public.tournaments t on t.id = trr.tournament_id
      where trr.room_id = $1::uuid
      limit 1
      `,
      [roomId]
    );
    const row = result.rows[0];
    if (!row?.tournament_id) return null;
    return {
      id: row.tournament_id,
      title: row.title ?? null,
      round_no: row.round_no ?? null,
    };
  } catch (err) {
    console.error("[LiveRoom] loadLiveTournamentForRoomFromPg error:", err);
    return null;
  }
}

/** Inverse of LiveRoomScreen prize pool math: ceil(gross * rate) === commission taken. */
export function deriveCommissionRateFromManifest(
  manifest: GameManifest
): number {
  const cardPrice = manifest.cardPrice ?? manifest.tickets[0]?.price ?? 0;
  if (cardPrice <= 0 || manifest.commissions.length === 0) return 0;

  const entry = manifest.commissions[0]!;
  const ticket = manifest.tickets.find((t) => t.ticketId === entry.ticketId);
  const gross = ticket?.price ?? cardPrice;
  if (gross <= 0) return 0;

  const totalCommission = Math.max(0, gross - entry.amountToPool);
  if (totalCommission <= 0) return 0;

  for (let numer = 0; numer <= 10_000; numer++) {
    const rate = numer / 10_000;
    if (Math.ceil(gross * rate) === totalCommission) return rate;
  }

  return Math.min(1, totalCommission / gross);
}

export function normalizeFrozenPrizeSplits(
  lineRaw: number,
  fullRaw: number
): { lineRewardPercentage: number; fullRewardPercentage: number } {
  let linePct = Math.max(lineRaw, 0);
  let fullPct = Math.max(fullRaw, 0);

  if (linePct === 0 && fullPct === 0) {
    linePct = 0.5;
    fullPct = 0.5;
  }

  if (linePct + fullPct > 1) {
    linePct = linePct / (linePct + fullPct);
    fullPct = 1 - linePct;
  }

  return {
    lineRewardPercentage: linePct,
    fullRewardPercentage: fullPct,
  };
}

export async function loadFrozenManifestRoomMetaFromPg(
  roomId: string
): Promise<FrozenManifestRoomMeta | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<{
      room_code: string | null;
      room_seed_hash: string | null;
      payload: unknown;
      manifest_version: number;
      rng_algorithm: string;
      rng_version: string;
    }>(
      `
      select
        r.room_code,
        r.room_seed_hash,
        m.payload,
        m.manifest_version,
        m.rng_algorithm,
        m.rng_version
      from public.game_manifests m
      inner join public.rooms r on r.id = m.room_id
      where m.room_id = $1::uuid
      limit 1
      `,
      [roomId]
    );

    const row = result.rows[0];
    if (!row) return null;

    const manifest = parseGameManifestPayload(row.payload, {
      manifestVersion: row.manifest_version,
      rngAlgorithm: row.rng_algorithm,
      rngVersion: row.rng_version,
    });

    const cardPrice = Number(manifest.cardPrice ?? manifest.tickets[0]?.price ?? 0);
    const { lineRewardPercentage, fullRewardPercentage } = normalizeFrozenPrizeSplits(
      manifest.lineRewardPercentage,
      manifest.fullRewardPercentage
    );

    return {
      roomCode: row.room_code,
      roomSeedHash: row.room_seed_hash ?? manifest.roomSeedHash ?? null,
      cardPrice,
      commissionRate: deriveCommissionRateFromManifest(manifest),
      lineRewardPercentage,
      fullRewardPercentage,
      isTournament: manifest.isTournament === true,
    };
  } catch (err) {
    console.error("[LiveRoom] loadFrozenManifestRoomMetaFromPg error:", err);
    return null;
  }
}

export async function loadCardPoolMetaForRoomFromPg(
  roomId: string
): Promise<CardPoolVersionMeta | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<{
      pool_id: string;
      commit_hash: string;
      prng_version: string;
      card_count: number;
    }>(
      `
      select
        cp.id::text as pool_id,
        cp.commit_hash,
        cp.prng_version,
        cp.card_count
      from public.rooms r
      join public.card_pools cp on cp.id = r.pool_id
      where r.id = $1::uuid
      limit 1
      `,
      [roomId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      poolId: row.pool_id,
      commitHash: row.commit_hash,
      prngVersion: row.prng_version,
      cardCount: Number(row.card_count ?? 0),
    };
  } catch (err) {
    console.error("[CardPoolCache] loadCardPoolMetaForRoomFromPg error:", err);
    return null;
  }
}
