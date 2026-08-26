import type { SupabaseClient } from "@supabase/supabase-js";
import { pgPool } from "@/lib/pg";

type PlayingCountRow = {
  user_id: string;
  playing_players: string | number;
};

const ACTIVE_ROOM_STATUSES = ["waiting", "playing", "live"] as const;
const ACTIVE_TICKET_STATUSES = ["reserved", "confirmed", "consumed"] as const;
const IN_CHUNK = 500;

function emptyCounts(): Map<string, number> {
  return new Map();
}

function addCount(map: Map<string, number>, userId: string | null | undefined, n: number) {
  if (!userId || n <= 0) return;
  map.set(userId, (map.get(userId) ?? 0) + n);
}

async function loadFromPostgres(): Promise<Map<string, number> | null> {
  if (!pgPool) return null;

  const result = await pgPool.query<PlayingCountRow>(
    `
    with playing as (
      select distinct t.player_user_id
      from public.tickets t
      join public.rooms r on r.id = t.room_id
      where r.status in ('waiting', 'playing', 'live')
        and t.cancelled_at is null
        and t.reservation_status in ('reserved', 'confirmed', 'consumed')
    )
    select pa.agent_id::text as user_id, count(*)::int as playing_players
    from playing p
    join public.player_affiliation pa on pa.user_id = p.player_user_id
    where pa.agent_id is not null
    group by pa.agent_id
    union all
    select pa.super_id::text, count(*)::int
    from playing p
    join public.player_affiliation pa on pa.user_id = p.player_user_id
    where pa.super_id is not null
    group by pa.super_id
    `
  );

  const map = emptyCounts();
  for (const row of result.rows) {
    addCount(map, row.user_id, Number(row.playing_players || 0));
  }
  return map;
}

async function selectInChunks<T>(
  ids: string[],
  fetchChunk: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    if (chunk.length === 0) continue;
    out.push(...(await fetchChunk(chunk)));
  }
  return out;
}

async function loadFromSupabase(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id")
    .in("status", [...ACTIVE_ROOM_STATUSES]);

  if (roomsError) {
    console.error("[Dashboard] operator playing rooms error:", roomsError.message);
    return emptyCounts();
  }

  const roomIds = (rooms || []).map((row) => String((row as { id: string }).id)).filter(Boolean);
  if (roomIds.length === 0) return emptyCounts();

  const tickets = await selectInChunks(roomIds, async (chunk) => {
    const { data, error } = await supabase
      .from("tickets")
      .select("player_user_id")
      .in("room_id", chunk)
      .in("reservation_status", [...ACTIVE_TICKET_STATUSES])
      .is("cancelled_at", null);
    if (error) {
      console.error("[Dashboard] operator playing tickets error:", error.message);
      return [];
    }
    return data || [];
  });

  const playerIds = [
    ...new Set(
      tickets
        .map((row) => String((row as { player_user_id?: string | null }).player_user_id || ""))
        .filter(Boolean)
    ),
  ];
  if (playerIds.length === 0) return emptyCounts();

  const affiliations = await selectInChunks(playerIds, async (chunk) => {
    const { data, error } = await supabase
      .from("player_affiliation")
      .select("user_id, agent_id, super_id")
      .in("user_id", chunk);
    if (error) {
      console.error("[Dashboard] operator playing affiliation error:", error.message);
      return [];
    }
    return data || [];
  });

  const map = emptyCounts();
  for (const row of affiliations) {
    const agentId = (row as { agent_id?: string | null }).agent_id;
    const superId = (row as { super_id?: string | null }).super_id;
    addCount(map, agentId, 1);
    addCount(map, superId, 1);
  }
  return map;
}

/**
 * Point-in-time count of distinct downline players currently in an active room
 * (waiting / playing / live), keyed by agent or super user id.
 *
 * Source of truth: PostgreSQL tickets + rooms + player_affiliation.
 */
export async function loadOperatorPlayingPlayerCounts(
  supabase?: SupabaseClient
): Promise<Map<string, number>> {
  try {
    const fromPg = await loadFromPostgres();
    if (fromPg) {
      console.log("[Dashboard] operator playing players loaded", {
        source: "postgres",
        operators: fromPg.size,
      });
      return fromPg;
    }
  } catch (err) {
    console.error("[Dashboard] operator playing players postgres error:", err);
  }

  if (!supabase) {
    console.warn("[Dashboard] operator playing players fallback skipped: no supabase client");
    return emptyCounts();
  }

  try {
    const fromSupabase = await loadFromSupabase(supabase);
    console.log("[Dashboard] operator playing players loaded", {
      source: "supabase",
      operators: fromSupabase.size,
    });
    return fromSupabase;
  } catch (err) {
    console.error("[Dashboard] operator playing players supabase error:", err);
    return emptyCounts();
  }
}
