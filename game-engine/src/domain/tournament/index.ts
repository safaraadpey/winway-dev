/**
 * Tournament domain orchestration.
 *
 * The tournament lifecycle is deeply DB-coupled (fn_manage_tournament_cycle,
 * fn_assign_templates_for_round, fn_seat_table_players, commission snapshots via
 * triggers). The migration roadmap classifies the *tick scheduling* as MOVE
 * (out of pg_cron job 16) and the seating/cycle internals as WRAP/MOVE-later.
 *
 * This orchestrator moves the SCHEDULING out of cron — the engine loop decides
 * when to tick — while the per-tournament state machine stays in the atomic
 * SECURITY DEFINER RPC tournament.fn_tick_due_tournaments. Behavior is identical
 * to cron job 16; only the driver changes. Re-enabling cron restores the DB path
 * (fallback), so this is safe during migration.
 */

import { decideTournamentTick, TOURNAMENT_DEFER_SECONDS } from "../../core/index.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";
import { TournamentRepo } from "../../repositories/tournamentRepo.js";

/** Postgres lock_not_available — fn_tick_tournament uses `FOR UPDATE NOWAIT`. */
const SQLSTATE_LOCK_NOT_AVAILABLE = "55P03";

export interface TickTournamentsOptions {
  limit: number;
  /** Optional batch_tables passthrough (NULL = all tables). */
  batchTables?: number | null;
}

/**
 * Mirrors cron: `SELECT tournament.fn_tick_due_tournaments()` — promotes due
 * registration_open tournaments to running, seats players, advances rounds.
 * Returns the number of tournaments ticked.
 */
export async function tickDueTournaments(
  supabase: SupabaseAdmin,
  log: Logger,
  opts: TickTournamentsOptions
): Promise<number> {
  const { data, error } = await supabase.rpc("fn_tick_due_tournaments", {
    p_limit: opts.limit,
    p_seed: null,
    p_batch_tables: opts.batchTables ?? null,
  });
  if (error) throw new Error(`fn_tick_due_tournaments failed: ${error.message}`);

  const ticked = Number(data ?? 0);
  if (ticked > 0) log.info("tournament tick", { ticked });
  return ticked;
}

/**
 * Engine-mode tick — ports the SELECTION/eligibility decision-making of
 * fn_tick_due_tournaments into TypeScript:
 *   - choose due tournaments (registration_open past start_at, or running),
 *   - decide eligibility (min players, floor 3) for registration_open,
 *   - defer start_at by 1h when under min, otherwise advance.
 *
 * The atomic per-tournament advance stays the DB RPC tournament.fn_tick_tournament
 * (preserves the row lock + seating/cycle atomicity = ownership model + fallback).
 * Per-tournament errors are isolated and logged to tournament.tournament_tick_log,
 * exactly like the SQL outer loop's EXCEPTION handler; lock_not_available is
 * skipped silently.
 */
export async function tickDueTournamentsEngine(
  supabase: SupabaseAdmin,
  log: Logger,
  opts: TickTournamentsOptions
): Promise<number> {
  const repo = new TournamentRepo(supabase);
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const candidates = await repo.getDueCandidates(opts.limit, nowIso);
  let ticked = 0;

  for (const candidate of candidates) {
    const players =
      candidate.status === "registration_open"
        ? await repo.countDistinctCreatedPlayers(candidate.id)
        : 0;

    const action = decideTournamentTick(candidate, nowMs, players);

    if (action.kind === "skip") continue;

    if (action.kind === "defer") {
      const newStart = new Date(nowMs + TOURNAMENT_DEFER_SECONDS * 1000).toISOString();
      await repo.deferStart(candidate.id, newStart, nowIso);
      continue;
    }

    // action.kind === 'tick' → atomic per-tournament advance via DB RPC.
    const { error } = await supabase.rpc("fn_tick_tournament", {
      p_tournament_id: candidate.id,
      p_seed: null,
      p_batch_tables:
        opts.batchTables == null ? null : [opts.batchTables],
    });

    if (!error) {
      ticked += 1;
      continue;
    }

    if ((error as { code?: string }).code === SQLSTATE_LOCK_NOT_AVAILABLE) {
      continue; // another worker holds the row lock; try next pass.
    }

    log.warn("fn_tick_tournament failed", { tournamentId: candidate.id, error: error.message });
    await repo
      .logTickError(candidate.id, "fn_tick_tournament", error.message)
      .catch((e) =>
        log.error("tournament_tick_log insert failed", {
          tournamentId: candidate.id,
          error: e instanceof Error ? e.message : String(e),
        })
      );
  }

  if (ticked > 0) log.info("tournament tick (engine)", { ticked });
  return ticked;
}
