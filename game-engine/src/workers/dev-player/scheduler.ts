import { randomUUID } from "node:crypto";
import { buildScheduleBatch } from "../../domain/dev-players/index.js";
import { DevPlayerRepo } from "../../repositories/devPlayerRepo.js";
import { redisKeys } from "../../redis/keys.js";
import { releaseLock, tryAcquireLock } from "../../redis/locks.js";
import type { WorkerContext } from "../context.js";

const MIN_TICK_SECONDS = 5;
const MAX_TICK_SECONDS = 3600;

/**
 * Creates dev_room_schedules from active join preset + enabled dev players.
 * Tick interval is read from dev_player_settings.scheduler_tick_interval_seconds
 * (Dev Panel → کنترل سیستم), with env DEV_PLAYER_SCHEDULER_INTERVAL_MS as fallback.
 */
export function startDevPlayerScheduler(ctx: WorkerContext): () => void {
  const { config, log, redis } = ctx;
  const repo = new DevPlayerRepo(ctx.supabase);
  const lockToken = randomUUID();
  const lockKey = redisKeys.devPlayerSchedulerLeader();

  let stopped = false;
  let inFlight = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const resolveTickDelayMs = async (): Promise<number> => {
    try {
      const settings = await repo.getSettings();
      const seconds = settings?.schedulerTickIntervalSeconds;
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
    return config.devPlayerSchedulerIntervalMs;
  };

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    let haveLock = false;

    try {
      if (redis) {
        haveLock = await tryAcquireLock(
          redis,
          lockKey,
          config.devPlayerSchedulerLockTtlSec,
          lockToken
        );
        if (!haveLock) return;
      }

      await buildScheduleBatch(repo, log);
    } catch (err) {
      log.error("dev-player-scheduler tick error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (redis && haveLock) {
        await releaseLock(redis, lockKey, lockToken).catch(() => undefined);
      }
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
