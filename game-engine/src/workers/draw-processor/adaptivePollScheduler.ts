import type { Logger } from "../../metrics/logger.js";
import {
  buildPickPollBackoffLadder,
  shouldAdvancePickPollBackoff,
  shouldResetPickPollFast,
} from "./pickPollBackoff.js";

export interface PollCycleOutcome {
  totalPicked: number;
  totalDispatched?: number;
  rpcAttemptedEmpty: boolean;
  lockDeferred: boolean;
}

export interface AdaptivePollSchedulerOptions {
  baseIntervalMs: number;
  enabled: boolean;
  log: Logger;
  onPoll: () => void;
  /** Optional telemetry hook when backoff level changes. */
  onBackoffChange?: (args: {
    delayMs: number;
    emptyPollStreak: number;
    reason: "fast-reset" | "idle-backoff";
  }) => void;
}

export interface AdaptivePollSchedulerDiagnostics {
  enabled: boolean;
  currentDelayMs: number;
  emptyPollStreak: number;
  ladderMs: number[];
}

export interface AdaptivePollScheduler {
  resetToFast(): void;
  notifyPollCycle(outcome: PollCycleOutcome): void;
  start(): void;
  stop(): void;
  getDiagnostics(): AdaptivePollSchedulerDiagnostics;
}

export function createAdaptivePollScheduler(
  opts: AdaptivePollSchedulerOptions
): AdaptivePollScheduler {
  const { baseIntervalMs, enabled, log, onPoll, onBackoffChange } = opts;

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
      getDiagnostics: () => ({
        enabled: false,
        currentDelayMs: baseIntervalMs,
        emptyPollStreak: 0,
        ladderMs: [baseIntervalMs],
      }),
    };
  }

  const ladder = buildPickPollBackoffLadder(baseIntervalMs);
  let emptyPollStreak = 0;
  let currentDelayMs = ladder[0]!;
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
    currentDelayMs = ladder[0]!;
    if (prev !== currentDelayMs) {
      log.info("[DrawPicker] pick-poll-backoff", {
        delayMs: currentDelayMs,
        emptyPollStreak,
        reason: "fast-reset",
      });
      onBackoffChange?.({
        delayMs: currentDelayMs,
        emptyPollStreak,
        reason: "fast-reset",
      });
    }
  };

  const advanceBackoff = (): void => {
    const prev = currentDelayMs;
    emptyPollStreak = Math.min(emptyPollStreak + 1, ladder.length - 1);
    currentDelayMs = ladder[emptyPollStreak]!;
    if (prev !== currentDelayMs) {
      log.info("[DrawPicker] pick-poll-backoff", {
        delayMs: currentDelayMs,
        emptyPollStreak,
        reason: "idle-backoff",
      });
      onBackoffChange?.({
        delayMs: currentDelayMs,
        emptyPollStreak,
        reason: "idle-backoff",
      });
    }
  };

  return {
    resetToFast: () => {
      applyFast();
      arm();
    },
    notifyPollCycle: (outcome) => {
      if (shouldResetPickPollFast(outcome)) {
        applyFast();
        arm();
        return;
      }
      if (shouldAdvancePickPollBackoff(outcome)) {
        advanceBackoff();
        arm();
        return;
      }
      arm();
    },
    start: () => {
      stopped = false;
      emptyPollStreak = 0;
      currentDelayMs = ladder[0]!;
      onPoll();
    },
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    getDiagnostics: () => ({
      enabled: true,
      currentDelayMs,
      emptyPollStreak,
      ladderMs: [...ladder],
    }),
  };
}
