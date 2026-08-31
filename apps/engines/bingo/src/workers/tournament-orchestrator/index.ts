import { randomUUID } from "node:crypto";
import {
  tickDueTournaments,
  tickDueTournamentsEngine,
  tickDevRegistrationSchedule,
} from "../../domain/tournament/index.js";
import { redisKeysV2 } from "../../redis/keysV2.js";
import { acquireLeaderLock, releaseLeaderLock } from "../../redis/leaderLock.js";
import { executesBusinessLogic, isIdle } from "../../runtime.js";
import type { WorkerContext } from "../context.js";

export function startTournamentOrchestrator(ctx: WorkerContext): () => void {
  const { supabase, config, log, redis } = ctx;
  const lockToken = randomUUID();
  const lockKey = redisKeysV2.lockWorkerTournament();
  const worker = "tournament-orchestrator";
  const redisLockDegraded = { value: false };

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
    let lockHeld = false;

    try {
      const lock = await acquireLeaderLock({
        redis,
        lockKey,
        ttlSec: config.tournamentLockTtlSec,
        token: lockToken,
        worker,
        log,
        degraded: redisLockDegraded,
        coordinationStrict: config.coordinationStrict,
        engineReplicaCount: config.engineReplicaCount,
      });
      if (!lock.proceed) return;
      lockHeld = lock.lockHeld;

      const opts = { limit: config.tournamentTickBatchLimit };
      if (executesBusinessLogic(config.runtime)) {
        await tickDueTournamentsEngine(supabase, log, opts);
      } else {
        await tickDueTournaments(supabase, log, opts);
      }
      await tickDevRegistrationSchedule(supabase, log, config.tournamentTickBatchLimit);
    } catch (err) {
      log.error("tournament-orchestrator tick error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await releaseLeaderLock({
        redis,
        lockKey,
        token: lockToken,
        lockHeld,
        worker,
        log,
      });
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
