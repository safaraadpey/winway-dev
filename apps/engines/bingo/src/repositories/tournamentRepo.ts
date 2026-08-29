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
import { getPgPool } from "../db/pg.js";
import type { SupabaseAdmin } from "../db/supabase-admin.js";

function fail(op: string, message: string): never {
  throw new Error(`tournamentRepo ${op}: ${message}`);
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
