import { randomUUID } from "node:crypto";
import { processScheduleBatch } from "../../domain/dev-players/index.js";
import { DEFAULT_PROCESSING_STUCK_TIMEOUT_SECONDS } from "../../domain/dev-players/requeueStuckProcessingSchedules.js";
import { DevPlayerRepo } from "../../repositories/devPlayerRepo.js";
import { acquireLeaderLock, releaseLeaderLock } from "../../redis/leaderLock.js";
import { redisKeys } from "../../redis/keys.js";
import type { WorkerContext } from "../context.js";

const MIN_TICK_SECONDS = 5;
const MAX_TICK_SECONDS = 3600;

/**
 * Picks approved dev_room_schedules and runs fn_system_join_or_create_room.
 * Tick interval from dev_player_settings.processor_tick_interval_seconds (Dev Panel).
 */
export function startDevPlayerProcessor(ctx: WorkerContext): () => void {
  const { config, log, redis } = ctx;
  const repo = new DevPlayerRepo(ctx.supabase);
  const lockToken = randomUUID();
  const lockKey = redisKeys.devPlayerProcessorLeader();
  const worker = "dev-player-processor";
  const redisLockDegraded = { value: false };

  let stopped = false;
  let inFlight = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const stuckTimeoutSeconds =
    Number(process.env.DEV_PLAYER_PROCESSING_STUCK_TIMEOUT_SEC) ||
    DEFAULT_PROCESSING_STUCK_TIMEOUT_SECONDS;

  const resolveTickDelayMs = async (): Promise<number> => {
    try {
      const settings = await repo.getSettings();
      const seconds = settings?.processorTickIntervalSeconds;
      if (
        typeof seconds === "number" &&
        Number.isInteger(seconds) &&
        seconds >= MIN_TICK_SECONDS &&
        seconds <= MAX_TICK_SECONDS
      ) {
        return seconds * 1000;
      }
    } catch {
      // fall through to env default
    }
    return config.devPlayerProcessorIntervalMs;
  };

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    let lockHeld = false;

    try {
      const lock = await acquireLeaderLock({
        redis,
        lockKey,
        ttlSec: config.devPlayerProcessorLockTtlSec,
        token: lockToken,
        worker,
        log,
        degraded: redisLockDegraded,
      });
      if (!lock.proceed) return;
      lockHeld = lock.lockHeld;

      await processScheduleBatch(
        repo,
        log,
        config.devPlayerProcessorBatchLimit,
        stuckTimeoutSeconds
      );
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

  const scheduleNext = async (): Promise<void> => {
    if (stopped) return;
    await tick();
    if (stopped) return;
    const delayMs = await resolveTickDelayMs();
    timeoutId = setTimeout(() => void scheduleNext(), delayMs);
  };

  void scheduleNext();

  return () => {
    stopped = true;
    if (timeoutId) clearTimeout(timeoutId);
  };
}
