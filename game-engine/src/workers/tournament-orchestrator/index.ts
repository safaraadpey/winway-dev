import {
  tickDueTournaments,
  tickDueTournamentsEngine,
} from "../../domain/tournament/index.js";
import { executesBusinessLogic, isIdle } from "../../runtime.js";
import type { WorkerContext } from "../context.js";

/**
 * Tournament tick. Replaces pg_cron job 16
 * (`SELECT tournament.fn_tick_due_tournaments()`), moving the SCHEDULING into
 * the engine loop. The per-tournament state machine stays in the atomic DB RPC
 * (WRAP) so behavior is identical; only the driver changes.
 *
 *   - legacy_db : idle (cron owns the tick).
 *   - hybrid / engine : engine drives `fn_tick_due_tournaments` on its interval.
 */
export function startTournamentOrchestrator(ctx: WorkerContext): () => void {
  const { supabase, config, log } = ctx;

  let stopped = false;
  let inFlight = false;
  let idleLogged = false;

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) return;

    if (isIdle(config.runtime)) {
      if (!idleLogged) {
        log.info("tournament-orchestrator idle (GAME_RUNTIME=legacy_db); cron owns tick");
        idleLogged = true;
      }
      return;
    }
    idleLogged = false;
    inFlight = true;

    try {
      // engine mode → TS selection/eligibility decisions, atomic advance via RPC.
      // hybrid mode → drive the whole DB RPC (WRAP).
      const opts = { limit: config.tournamentTickBatchLimit };
      if (executesBusinessLogic(config.runtime)) {
        await tickDueTournamentsEngine(supabase, log, opts);
      } else {
        await tickDueTournaments(supabase, log, opts);
      }
    } catch (err) {
      log.error("tournament-orchestrator tick error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inFlight = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), config.tournamentTickIntervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
