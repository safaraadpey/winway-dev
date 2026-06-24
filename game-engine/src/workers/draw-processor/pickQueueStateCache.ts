import type { Logger } from "../../metrics/logger.js";
import type { GameRepo } from "../../repositories/index.js";

export interface PickQueueSnapshot {
  queuedJobsCount: number;
  processingJobsCount: number;
  oldestQueuedAgeMs: number;
}

export interface PickQueueStateCache {
  snapshot(): PickQueueSnapshot;
  hasQueued(): boolean;
  noteEnqueued(count?: number): void;
  notePicked(count: number): void;
  requestRefresh(): void;
  reset(): void;
  stop(): void;
}

const EMPTY_SNAPSHOT: PickQueueSnapshot = {
  queuedJobsCount: 0,
  processingJobsCount: 0,
  oldestQueuedAgeMs: 0,
};

/** Background-refreshed queue counters — never queried from the hot pick loop. */
export function createPickQueueStateCache(opts: {
  repo: GameRepo;
  log: Logger;
  refreshIntervalMs?: number;
  /** When false, in-memory counters only — no fetchPickDebugQueueState polls. */
  dbRefreshEnabled?: boolean;
}): PickQueueStateCache {
  const refreshIntervalMs = opts.refreshIntervalMs ?? 500;
  const dbRefreshEnabled = opts.dbRefreshEnabled !== false;
  let state: PickQueueSnapshot = { ...EMPTY_SNAPSHOT };
  let refreshInFlight = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const refresh = async (): Promise<void> => {
    if (!dbRefreshEnabled || stopped || refreshInFlight) return;
    refreshInFlight = true;
    try {
      const live = await opts.repo.fetchPickDebugQueueState();
      state = {
        queuedJobsCount: live.queuedJobsCount,
        processingJobsCount: live.processingJobsCount,
        oldestQueuedAgeMs: live.oldestQueuedAgeMs,
      };
    } catch (err) {
      opts.log.warn("pick queue cache refresh failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      refreshInFlight = false;
    }
  };

  if (dbRefreshEnabled) {
    timer = setInterval(() => {
      void refresh();
    }, refreshIntervalMs);
    void refresh();
  }

  return {
    snapshot: () => ({ ...state }),
    hasQueued: () => state.queuedJobsCount > 0,
    noteEnqueued: (count = 1) => {
      state.queuedJobsCount += count;
    },
    notePicked: (count: number) => {
      state.queuedJobsCount = Math.max(0, state.queuedJobsCount - count);
      state.processingJobsCount += count;
    },
    requestRefresh: () => {
      if (dbRefreshEnabled) void refresh();
    },
    reset: () => {
      state = { ...EMPTY_SNAPSHOT };
    },
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
