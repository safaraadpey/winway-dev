/**
 * Tournament data access for the engine-driven tick.
 *
 * Reads the due-tournament set and player counts (the inputs to the eligibility
 * decision). Quorum is COUNT(DISTINCT) from PostgreSQL, not a PostgREST row
 * select — an empty payload used to look like 0 players and defer +60 minutes.
 * Also performs the two non-advance writes the SQL outer loop owns:
 *   - defer start_at when under min players and auto-extend is on,
 *   - cancel + refund via RPC when under min and auto-extend is off,
 *   - append a tournament_tick_log row on per-tournament failure.
 *
 * The atomic per-tournament advance (fn_tick_tournament) and seating/cycle stay
 * in DB RPCs (called from the domain orchestrator), preserving the ledger/owner
 * model and the fallback path.
 */

import type { Pool } from "pg";
import type { TournamentTickCandidate } from "../core/index.js";
import type { RoundSeatSnapshot } from "../core/tournamentRoomStagger.js";
import { getPgPool } from "../db/pg.js";
import type { SupabaseAdmin } from "../db/supabase-admin.js";

function fail(op: string, message: string): never {
  throw new Error(`tournamentRepo ${op}: ${message}`);
}

function parseTimeMs(raw: unknown): number | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(`${raw}`);
  return Number.isFinite(ms) ? ms : null;
}

function parseRoundSeatSnapshot(row: {
  round_no?: string | number;
  table_count?: string | number;
  unseated_count?: string | number;
  last_room_created_at?: Date | string | null;
} | undefined): RoundSeatSnapshot {
  const roundNo = Number(row?.round_no ?? 0);
  const tableCount = Number(row?.table_count ?? 0);
  const unseatedCount = Number(row?.unseated_count ?? 0);
  return {
    roundNo: Number.isFinite(roundNo) ? roundNo : 0,
    tableCount: Number.isFinite(tableCount) ? tableCount : 0,
    unseatedCount: Number.isFinite(unseatedCount) ? unseatedCount : 0,
    lastRoomCreatedAtMs: parseTimeMs(row?.last_room_created_at ?? null),
  };
}

function parseExactCount(raw: unknown, source: string): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    fail("countDistinctCreatedPlayers", `invalid count from ${source}`);
  }
  return Math.floor(n);
}

export class TournamentRepo {
  constructor(
    private readonly db: SupabaseAdmin,
    private readonly pg: Pool | null = getPgPool()
  ) {}

  /**
   * Due candidates: registration_open with start_at <= now, plus all running.
   * Mirrors the outer SELECT of fn_tick_due_tournaments (ordered start_at NULLS
   * LAST, created_at; limited). Implemented as two scoped queries to keep the
   * PostgREST filter simple, then merged + ordered in TS.
   */
  async getDueCandidates(limit: number, nowIso: string): Promise<TournamentTickCandidate[]> {
    const cols = "id,status,start_at,meta,created_at";

    const open = await this.db
      .from("tournaments")
      .select(cols)
      .eq("status", "registration_open")
      .not("start_at", "is", null)
      .lte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(limit);
    if (open.error) fail("getDueCandidates(open)", open.error.message);

    const running = await this.db
      .from("tournaments")
      .select(cols)
      .eq("status", "running")
      .limit(limit);
    if (running.error) fail("getDueCandidates(running)", running.error.message);

    type Row = {
      id: string;
      status: string;
      start_at: string | null;
      meta: Record<string, unknown> | null;
      created_at: string | null;
    };
    const rows = [...((open.data ?? []) as Row[]), ...((running.data ?? []) as Row[])];

    rows.sort((a, b) => {
      // start_at ASC NULLS LAST, then created_at ASC.
      const sa = a.start_at ? Date.parse(a.start_at) : Number.POSITIVE_INFINITY;
      const sb = b.start_at ? Date.parse(b.start_at) : Number.POSITIVE_INFINITY;
      if (sa !== sb) return sa - sb;
      const ca = a.created_at ? Date.parse(a.created_at) : 0;
      const cb = b.created_at ? Date.parse(b.created_at) : 0;
      return ca - cb;
    });

    return rows.slice(0, limit).map((r) => ({
      id: r.id,
      status: r.status,
      startAt: r.start_at,
      meta: r.meta,
    }));
  }

  /**
   * Distinct user_id with entry status 'created'.
   * Source of truth is PostgreSQL COUNT(DISTINCT). PostgREST row-select is not
   * used — an empty payload used to look like 0 players and defer +60 minutes.
   */
  async countDistinctCreatedPlayers(tournamentId: string): Promise<number> {
    if (this.pg) {
      const result = await this.pg.query<{ n: string | number }>(
        `
        SELECT COUNT(DISTINCT te.user_id)::int AS n
          FROM public.tournament_entries te
         WHERE te.tournament_id = $1::uuid
           AND te.status = 'created'
        `,
        [tournamentId]
      );
      return parseExactCount(result.rows[0]?.n, "postgres");
    }

    const { count, error } = await this.db
      .from("tournament_entries")
      .select("user_id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .eq("status", "created");
    if (error) fail("countDistinctCreatedPlayers", error.message);
    return parseExactCount(count, "supabase_count");
  }

  /**
   * Current-round seating snapshot: how many tables still need a room, and when
   * the last room was created. Used to stagger fn_tick_tournament seating.
   */
  async getRoundSeatSnapshot(tournamentId: string): Promise<RoundSeatSnapshot> {
    if (this.pg) {
      const result = await this.pg.query<{
        round_no: string | number;
        table_count: string | number;
        unseated_count: string | number;
        last_room_created_at: Date | string | null;
      }>(
        `
        WITH curr AS (
          SELECT COALESCE(MAX(round_no), 0) AS round_no
            FROM public.tournament_round_rooms
           WHERE tournament_id = $1::uuid
        )
        SELECT
          c.round_no,
          COUNT(trr.id)::int AS table_count,
          COUNT(trr.id) FILTER (WHERE trr.room_id IS NULL)::int AS unseated_count,
          MAX(COALESCE(r.created_at, (trr.meta->>'room_created_at')::timestamptz))
            AS last_room_created_at
          FROM curr c
          LEFT JOIN public.tournament_round_rooms trr
            ON trr.tournament_id = $1::uuid
           AND trr.round_no = c.round_no
           AND c.round_no > 0
          LEFT JOIN public.rooms r ON r.id = trr.room_id
         GROUP BY c.round_no
        `,
        [tournamentId]
      );
      const row = result.rows[0];
      return parseRoundSeatSnapshot(row);
    }

    const maxRound = await this.db
      .from("tournament_round_rooms")
      .select("round_no")
      .eq("tournament_id", tournamentId)
      .order("round_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxRound.error) fail("getRoundSeatSnapshot(round)", maxRound.error.message);

    const roundNo = Number((maxRound.data as { round_no?: number } | null)?.round_no ?? 0);
    if (!roundNo) {
      return { roundNo: 0, tableCount: 0, unseatedCount: 0, lastRoomCreatedAtMs: null };
    }

    const tables = await this.db
      .from("tournament_round_rooms")
      .select("id,room_id,meta")
      .eq("tournament_id", tournamentId)
      .eq("round_no", roundNo);
    if (tables.error) fail("getRoundSeatSnapshot(tables)", tables.error.message);

    type TrRow = {
      id: string;
      room_id: string | null;
      meta: Record<string, unknown> | null;
    };
    const rows = (tables.data ?? []) as TrRow[];
    const roomIds = rows.map((r) => r.room_id).filter((id): id is string => !!id);
    let lastRoomCreatedAtMs: number | null = null;
    for (const row of rows) {
      const metaAt = parseTimeMs(row.meta?.["room_created_at"]);
      if (metaAt != null && (lastRoomCreatedAtMs == null || metaAt > lastRoomCreatedAtMs)) {
        lastRoomCreatedAtMs = metaAt;
      }
    }
    if (roomIds.length > 0) {
      const rooms = await this.db
        .from("rooms")
        .select("created_at")
        .in("id", roomIds);
      if (rooms.error) fail("getRoundSeatSnapshot(rooms)", rooms.error.message);
      for (const room of rooms.data ?? []) {
        const created = parseTimeMs((room as { created_at?: string | null }).created_at);
        if (created != null && (lastRoomCreatedAtMs == null || created > lastRoomCreatedAtMs)) {
          lastRoomCreatedAtMs = created;
        }
      }
    }

    return {
      roundNo,
      tableCount: rows.length,
      unseatedCount: rows.filter((r) => !r.room_id).length,
      lastRoomCreatedAtMs,
    };
  }

  /** Push start_at (the "not enough players + auto-extend" branch). */
  async deferStart(tournamentId: string, newStartIso: string, nowIso: string): Promise<void> {
    const { error } = await this.db
      .from("tournaments")
      .update({ start_at: newStartIso, updated_at: nowIso })
      .eq("id", tournamentId)
      .eq("status", "registration_open");
    if (error) fail("deferStart", error.message);
  }

  /** Cancel a due registration_open tournament that missed quorum. */
  async cancelUnderMin(tournamentId: string): Promise<void> {
    const { error } = await this.db.rpc("fn_cancel_under_min_players", {
      p_tournament_id: tournamentId,
    });
    if (error) fail("cancelUnderMin", error.message);
  }

  /** Append a failure row to tournament.tournament_tick_log (best-effort). */
  async logTickError(
    tournamentId: string,
    stage: string,
    message: string
  ): Promise<void> {
    const { error } = await this.db
      .schema("tournament")
      .from("tournament_tick_log")
      .insert({ tournament_id: tournamentId, stage, sqlstate: null, message, context: null });
    if (error) {
      // Logging must never break the loop; swallow after surfacing once.
      throw new Error(`tournamentRepo logTickError: ${error.message}`);
    }
  }
}
