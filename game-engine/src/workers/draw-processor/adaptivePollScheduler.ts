import type { Logger } from "../../metrics/logger.js";

export interface PollCycleOutcome {
  totalPicked: number;
  rpcAttemptedEmpty: boolean;
  lockDeferred: boolean;
}

export interface AdaptivePollSchedulerOptions {
  baseIntervalMs: number;
  enabled: boolean;
  log: Logger;
  onPoll: () => void;
}

export interface AdaptivePollScheduler {
  resetToFast(): void;
  notifyPollCycle(outcome: PollCycleOutcome): void;
  start(): void;
  stop(): void;
}

function buildLadder(baseMs: number): number[] {
  const steps = [baseMs, 1000, 2000, 5000];
  const seen = new Set<number>();
  const ladder: number[] = [];
  for (const ms of steps) {
    if (!seen.has(ms)) {
      seen.add(ms);
      ladder.push(ms);
    }
  }
  return ladder.sort((a, b) => a - b);
}

export function createAdaptivePollScheduler(
  opts: AdaptivePollSchedulerOptions
): AdaptivePollScheduler {
  const { baseIntervalMs, enabled, log, onPoll } = opts;

  if (!enabled) {
    let interval: ReturnType<typeof setInterval> | null = null;
    return {
      resetToFast: () => undefined,
      notifyPollCycle: () => undefined,
      start: () => {
        onPoll();
        interval = setInterval(onPoll, baseIntervalMs);
      },
      stop: () => {
        if (interval) clearInterval(interval);
        interval = null;
      },
    };
  }

  const ladder = buildLadder(baseIntervalMs);
  let emptyPollStreak = 0;
  let currentDelayMs = ladder[0];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const arm = (): void => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onPoll();
    }, currentDelayMs);
  };

  const applyFast = (): void => {
    const prev = currentDelayMs;
    emptyPollStreak = 0;
    currentDelayMs = ladder[0];
    if (prev !== currentDelayMs) {
      log.info("[Scheduler] pick-poll-backoff", {
        delayMs: currentDelayMs,
        emptyPollStreak,
      });
    }
  };

  return {
    resetToFast: () => {
      applyFast();
      arm();
    },
    notifyPollCycle: (outcome) => {
      if (outcome.totalPicked > 0) {
        applyFast();
        arm();
        return;
      }
      if (!outcome.rpcAttemptedEmpty) {
        arm();
        return;
      }
      const prev = currentDelayMs;
      emptyPollStreak = Math.min(emptyPollStreak + 1, ladder.length - 1);
      currentDelayMs = ladder[emptyPollStreak];
      if (prev !== currentDelayMs) {
        log.info("[Scheduler] pick-poll-backoff", {
          delayMs: currentDelayMs,
          emptyPollStreak,
        });
      }
      arm();
    },
    start: () => {
      stopped = false;
      emptyPollStreak = 0;
      currentDelayMs = ladder[0];
      onPoll();
    },
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
