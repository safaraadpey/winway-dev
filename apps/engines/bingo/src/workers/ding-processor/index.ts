import { randomUUID } from "node:crypto";
import { reapStaleDingApplyJobs } from "../../domain/ding/reapStaleDingJobs.js";
import {
  processDingApplyJob,
  type DingApplyJob,
} from "../../domain/ding/processDingApplyJob.js";
import { GameRepo } from "../../repositories/index.js";
import { redisKeysV2 } from "../../redis/keysV2.js";
import { acquireLeaderLock, releaseLeaderLock } from "../../redis/leaderLock.js";
import { executesBusinessLogic } from "../../runtime.js";
import type { WorkerContext } from "../context.js";

export function startDingProcessor(ctx: WorkerContext): () => void {
  const { supabase, config, log, redis } = ctx;
  const lockToken = randomUUID();
  const lockKey = redisKeysV2.lockWorkerDingProcessor();
  const worker = "ding-processor";
  const repo = new GameRepo(supabase);

  let stopped = false;
  let inFlight = false;
  let lastReapMs = 0;
  const redisLockDegraded = { value: false };

  const maybeReap = async (): Promise<void> => {
    if (!executesBusinessLogic(config.runtime)) return;
    const now = Date.now();
    if (now - lastReapMs < config.dingJobReapIntervalMs) return;
    lastReapMs = now;
    await reapStaleDingApplyJobs({
      repo,
      log,
      staleSec: config.dingJobStaleSec,
    });
  };

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) return;
    if (!executesBusinessLogic(config.runtime)) return;
    if (!config.dingAsyncEnabled) return;

    inFlight = true;
    let lockHeld = false;

    try {
      const lock = await acquireLeaderLock({
        redis,
        lockKey,
        ttlSec: config.dingProcessorLockTtlSec,
        token: lockToken,
        worker,
        log,
        degraded: redisLockDegraded,
        coordinationStrict: config.coordinationStrict,
        engineReplicaCount: config.engineReplicaCount,
      });
      if (!lock.proceed) return;
      lockHeld = lock.lockHeld;

      await maybeReap();

      const jobs = await repo.pickDingApplyJobs(config.dingProcessorBatchSize);
      for (const job of jobs) {
        if (stopped) break;
        await processDingApplyJob(repo, log, job as DingApplyJob, {
          maxAttempts: config.dingProcessorMaxAttempts,
        });
      }
    } catch (err) {
      log.error(`${worker} tick error`, {
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

  const intervalId = setInterval(() => void tick(), config.dingProcessorIntervalMs);
  void tick();

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}
