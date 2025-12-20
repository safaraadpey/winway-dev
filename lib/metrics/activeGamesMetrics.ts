/**
 * Active Games Dev Metrics (Instrumentation only)
 *
 * Goals:
 * - Dev-only observability (no meaningful production overhead)
 * - No React state usage (no re-render pressure)
 * - Snapshot-friendly output for copy/paste
 */
export type ActiveGamesFetchSource = "initial" | "polling" | "realtime" | "manual";

export type ActiveGamesLastEtagStatus = 200 | 304 | "errored" | null;

export type ActiveGamesLifecycleEvent =
  | "mount"
  | "unmount"
  | "cleanup"
  | "route-change"
  | "auth-missing";

export interface ActiveGamesMetricsSnapshot {
  initCount: number;
  fetchCountBySource: Record<ActiveGamesFetchSource, number>;
  inFlight: number;
  maxConcurrentInFlight: number;
  channelCount: number;
  pollingState: { active: boolean; intervalMs: number | null };
  lastFetchAt: string | null;
  lastPatchAt: string | null;
  lastFetchSource: ActiveGamesFetchSource | null;
  lastEtagStatus: ActiveGamesLastEtagStatus;
  lastError: string | null;
  updatedAt: string;
}

const IS_DEV = process.env.NODE_ENV !== "production";
const PREFIX_METRICS = "[ActiveGames][Metrics]";
const PREFIX_LIFECYCLE = "[ActiveGames][Lifecycle]";

type Store = {
  initCount: number;
  fetchCountBySource: Record<ActiveGamesFetchSource, number>;
  inFlight: number;
  maxConcurrentInFlight: number;
  channelCount: number;
  pollingState: { active: boolean; intervalMs: number | null };
  lastFetchAt: string | null;
  lastPatchAt: string | null;
  lastFetchSource: ActiveGamesFetchSource | null;
  lastEtagStatus: ActiveGamesLastEtagStatus;
  lastError: string | null;
  updatedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function getGlobalStore(): Store {
  const g = globalThis as any;
  if (!g.__ACTIVE_GAMES_METRICS_STORE__) {
    g.__ACTIVE_GAMES_METRICS_STORE__ = {
      initCount: 0,
      fetchCountBySource: { initial: 0, polling: 0, realtime: 0, manual: 0 },
      inFlight: 0,
      maxConcurrentInFlight: 0,
      channelCount: 0,
      pollingState: { active: false, intervalMs: null },
      lastFetchAt: null,
      lastPatchAt: null,
      lastFetchSource: null,
      lastEtagStatus: null,
      lastError: null,
      updatedAt: nowIso(),
    } satisfies Store;
  }
  return g.__ACTIVE_GAMES_METRICS_STORE__ as Store;
}

function touch(store: Store) {
  store.updatedAt = nowIso();
}

export function activeGamesMetricsSnapshot(): ActiveGamesMetricsSnapshot {
  const s = getGlobalStore();
  return {
    initCount: s.initCount,
    fetchCountBySource: { ...s.fetchCountBySource },
    inFlight: s.inFlight,
    maxConcurrentInFlight: s.maxConcurrentInFlight,
    channelCount: s.channelCount,
    pollingState: { ...s.pollingState },
    lastFetchAt: s.lastFetchAt,
    lastPatchAt: s.lastPatchAt,
    lastFetchSource: s.lastFetchSource,
    lastEtagStatus: s.lastEtagStatus,
    lastError: s.lastError,
    updatedAt: s.updatedAt,
  };
}

export function installActiveGamesMetricsOnWindow(): void {
  if (!IS_DEV) return;
  if (typeof window === "undefined") return;

  const w = window as any;
  if (typeof w.__activeGamesMetrics === "function") return;

  w.__activeGamesMetrics = () => activeGamesMetricsSnapshot();
  w.__activeGamesMetricsPrint = (label?: string) => {
    const snap = activeGamesMetricsSnapshot();
    console.log(PREFIX_METRICS, "snapshot", label ? { label } : {}, snap);
    return snap;
  };
  w.__activeGamesMetricsReset = () => {
    const s = getGlobalStore();
    s.initCount = 0;
    s.fetchCountBySource = { initial: 0, polling: 0, realtime: 0, manual: 0 };
    s.inFlight = 0;
    s.maxConcurrentInFlight = 0;
    s.channelCount = 0;
    s.pollingState = { active: false, intervalMs: null };
    s.lastFetchAt = null;
    s.lastPatchAt = null;
    s.lastFetchSource = null;
    s.lastEtagStatus = null;
    s.lastError = null;
    touch(s);
    console.log(PREFIX_METRICS, "reset", activeGamesMetricsSnapshot());
  };

  console.log(PREFIX_METRICS, "window helpers installed", {
    get: "window.__activeGamesMetrics()",
    print: "window.__activeGamesMetricsPrint(label?)",
    reset: "window.__activeGamesMetricsReset()",
  });
}

export const activeGamesMetrics = {
  lifecycle(event: ActiveGamesLifecycleEvent, data?: Record<string, unknown>) {
    if (!IS_DEV) return;
    console.log(PREFIX_LIFECYCLE, event, data ?? {});
  },

  init() {
    if (!IS_DEV) return;
    const s = getGlobalStore();
    s.initCount += 1;
    touch(s);
    console.log(PREFIX_METRICS, "init", { initCount: s.initCount });
  },

  channelAdded(info?: Record<string, unknown>) {
    if (!IS_DEV) return;
    const s = getGlobalStore();
    s.channelCount += 1;
    touch(s);
    console.log(PREFIX_METRICS, "channel+1", { channelCount: s.channelCount, ...(info ?? {}) });
  },

  channelRemoved(info?: Record<string, unknown>) {
    if (!IS_DEV) return;
    const s = getGlobalStore();
    s.channelCount = Math.max(0, s.channelCount - 1);
    touch(s);
    console.log(PREFIX_METRICS, "channel-1", { channelCount: s.channelCount, ...(info ?? {}) });
  },

  pollingStart(intervalMs: number) {
    if (!IS_DEV) return;
    const s = getGlobalStore();
    s.pollingState = { active: true, intervalMs };
    touch(s);
    console.log(PREFIX_METRICS, "polling:on", s.pollingState);
  },

  pollingStop() {
    if (!IS_DEV) return;
    const s = getGlobalStore();
    s.pollingState = { active: false, intervalMs: null };
    touch(s);
    console.log(PREFIX_METRICS, "polling:off");
  },

  fetchStart(source: ActiveGamesFetchSource, info?: Record<string, unknown>) {
    if (!IS_DEV) return;
    const s = getGlobalStore();
    s.fetchCountBySource[source] = (s.fetchCountBySource[source] ?? 0) + 1;
    s.inFlight += 1;
    s.maxConcurrentInFlight = Math.max(s.maxConcurrentInFlight, s.inFlight);
    s.lastFetchAt = nowIso();
    s.lastFetchSource = source;
    s.lastError = null;
    touch(s);

    console.log(PREFIX_METRICS, "fetch:start", {
      source,
      inFlight: s.inFlight,
      maxConcurrentInFlight: s.maxConcurrentInFlight,
      fetchCountBySource: { ...s.fetchCountBySource },
      ...(info ?? {}),
    });
  },

  fetchEnd(source: ActiveGamesFetchSource, status: ActiveGamesLastEtagStatus, info?: Record<string, unknown>) {
    if (!IS_DEV) return;
    const s = getGlobalStore();
    s.inFlight = Math.max(0, s.inFlight - 1);
    s.lastEtagStatus = status;
    if (status === "errored" && typeof info?.error === "string") {
      s.lastError = info.error;
    }
    touch(s);
    console.log(PREFIX_METRICS, "fetch:end", {
      source,
      status,
      inFlight: s.inFlight,
      ...(info ?? {}),
    });
  },

  patch(info?: Record<string, unknown>) {
    if (!IS_DEV) return;
    const s = getGlobalStore();
    s.lastPatchAt = nowIso();
    touch(s);
    console.log(PREFIX_METRICS, "patch", info ?? {});
  },

  print(label?: string) {
    if (!IS_DEV) return;
    console.log(PREFIX_METRICS, "snapshot", label ? { label } : {}, activeGamesMetricsSnapshot());
  },
};


