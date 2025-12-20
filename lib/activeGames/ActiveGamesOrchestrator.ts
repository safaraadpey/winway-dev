/**
 * ActiveGamesOrchestrator (Phase C: Swap Data Source)
 *
 * External store (بدون وابستگی به React):
 * - getSnapshot(): خروجی هم‌شکل ActiveGames (rooms/loading/error)
 * - subscribe(listener): برای rerender در React (useSyncExternalStore)
 *
 * Phase C constraints:
 * - UI تغییر نمی‌کند و MyActiveGames دست‌نخورده می‌ماند
 * - legacy hook (useActiveGames) باید bypass شود (feature flag در Context)
 * - fetch/realtime/polling می‌تواند موقتاً مشابه legacy باشد
 * - همه triggerها از orchestrator عبور کنند و single-flight concurrency=1 باشد
 */

import { supabase } from "@/lib/supabaseClient";
import type { ActiveGames, ActiveRoom } from "@/lib/hooks/useActiveGames";
import { activeGamesMetrics, type ActiveGamesFetchSource } from "@/lib/metrics/activeGamesMetrics";

const IS_DEV = process.env.NODE_ENV !== "production";
const PREFIX_METRICS = "[ActiveGames][Metrics]";
const PREFIX_LIFECYCLE = "[ActiveGames][Lifecycle]";

export interface ActiveGamesOrchestratorMetricsSnapshot {
  component: "orchestrator";
  initCount: number;
  roomsCount: number;
  loading: boolean;
  error: string | null;
  fetchCountBySource: Record<ActiveGamesFetchSource, number>;
  inFlight: number;
  maxConcurrentInFlight: number;
  channelCount: number;
  pollingState: { active: boolean; intervalMs: number | null };
  timerCount: number;
  nextPollAt: string | null;
  backoffMs: number;
  pendingReasons: ActiveGamesFetchSource[];
  lastFetchAt: string | null;
  lastUpdatedAt: string | null;
  lastEtagStatus: 200 | 304 | "errored" | null;
  lastInitAt: string | null;
  lastCleanupAt: string | null;
  updatedAt: string;
}

type Store = {
  initCount: number;
  data: ActiveGames;
  lastUpdatedAt: string | null;
  fetchCountBySource: Record<ActiveGamesFetchSource, number>;
  inFlight: number;
  maxConcurrentInFlight: number;
  channelCount: number;
  pollingState: { active: boolean; intervalMs: number | null };
  timerCount: number;
  nextPollAt: string | null;
  backoffMs: number;
  pendingReasons: Set<ActiveGamesFetchSource>;
  lastFetchAt: string | null;
  lastEtagStatus: 200 | 304 | "errored" | null;
  lastRoomsSig: string | null;
  lastUnchanged: boolean;
  lastFetchEndAt: string | null;
  lastInitAt: string | null;
  lastCleanupAt: string | null;
  updatedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function getStore(): Store {
  const g = globalThis as any;
  if (!g.__ACTIVE_GAMES_ORCHESTRATOR_STORE__) {
    g.__ACTIVE_GAMES_ORCHESTRATOR_STORE__ = {
      initCount: 0,
      data: { rooms: [], loading: true, error: null },
      lastUpdatedAt: null,
      fetchCountBySource: { initial: 0, polling: 0, realtime: 0, manual: 0 },
      inFlight: 0,
      maxConcurrentInFlight: 0,
      channelCount: 0,
      pollingState: { active: false, intervalMs: null },
      timerCount: 0,
      nextPollAt: null,
      backoffMs: 0,
      pendingReasons: new Set<ActiveGamesFetchSource>(),
      lastFetchAt: null,
      lastEtagStatus: null,
      lastRoomsSig: null,
      lastUnchanged: false,
      lastFetchEndAt: null,
      lastInitAt: null,
      lastCleanupAt: null,
      updatedAt: nowIso(),
    } satisfies Store;
  }
  return g.__ACTIVE_GAMES_ORCHESTRATOR_STORE__ as Store;
}

function touch(s: Store) {
  s.updatedAt = nowIso();
}

function metricsSnapshot(): ActiveGamesOrchestratorMetricsSnapshot {
  const s = getStore();
  return {
    component: "orchestrator",
    initCount: s.initCount,
    roomsCount: s.data.rooms.length,
    loading: s.data.loading,
    error: s.data.error,
    fetchCountBySource: { ...s.fetchCountBySource },
    inFlight: s.inFlight,
    maxConcurrentInFlight: s.maxConcurrentInFlight,
    channelCount: s.channelCount,
    pollingState: { ...s.pollingState },
    timerCount: s.timerCount,
    nextPollAt: s.nextPollAt,
    backoffMs: s.backoffMs,
    pendingReasons: Array.from(s.pendingReasons),
    lastFetchAt: s.lastFetchAt,
    lastUpdatedAt: s.lastUpdatedAt,
    lastEtagStatus: s.lastEtagStatus,
    lastInitAt: s.lastInitAt,
    lastCleanupAt: s.lastCleanupAt,
    updatedAt: s.updatedAt,
  };
}

export function installActiveGamesOrchestratorMetricsOnWindow(): void {
  if (!IS_DEV) return;
  if (typeof window === "undefined") return;

  const w = window as any;
  if (typeof w.__activeGamesOrchestratorMetrics === "function") return;

  w.__activeGamesOrchestratorMetrics = () => metricsSnapshot();
  w.__activeGamesOrchestratorMetricsPrint = (label?: string) => {
    const snap = metricsSnapshot();
    console.log(PREFIX_METRICS, "snapshot", { component: "orchestrator", ...(label ? { label } : {}) }, snap);
    return snap;
  };
  w.__activeGamesOrchestratorMetricsReset = () => {
    const s = getStore();
    s.initCount = 0;
    s.data = { rooms: [], loading: true, error: null };
    s.lastUpdatedAt = null;
    s.fetchCountBySource = { initial: 0, polling: 0, realtime: 0, manual: 0 };
    s.inFlight = 0;
    s.maxConcurrentInFlight = 0;
    s.channelCount = 0;
    s.pollingState = { active: false, intervalMs: null };
    s.timerCount = 0;
    s.nextPollAt = null;
    s.backoffMs = 0;
    s.pendingReasons = new Set<ActiveGamesFetchSource>();
    s.lastFetchAt = null;
    s.lastEtagStatus = null;
    s.lastRoomsSig = null;
    s.lastUnchanged = false;
    s.lastFetchEndAt = null;
    s.lastInitAt = null;
    s.lastCleanupAt = null;
    touch(s);
    console.log(PREFIX_METRICS, "reset", { component: "orchestrator" }, metricsSnapshot());
  };

  console.log(PREFIX_METRICS, "window helpers installed", {
    component: "orchestrator",
    get: "window.__activeGamesOrchestratorMetrics()",
    print: "window.__activeGamesOrchestratorMetricsPrint(label?)",
    reset: "window.__activeGamesOrchestratorMetricsReset()",
  });
}

export interface ActiveGamesOrchestrator {
  start(): void;
  stop(): void;
  getSnapshot(): ActiveGames;
  subscribe(listener: () => void): () => void;
}

function createOrchestrator(): ActiveGamesOrchestrator {
  const store = getStore();
  const listeners = new Set<() => void>();

  let active = false;
  let runId = 0;

  let channel: ReturnType<typeof supabase.channel> | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let realtimeCooldownTimer: NodeJS.Timeout | null = null;
  let etag: string | null = null;

  // single-flight / coalescing
  let pending = false;
  let pendingSkipEtag = false;
  let pendingReasons = new Set<ActiveGamesFetchSource>();

  // guards
  const BASE_POLL_INTERVAL_MS = 12000; // legacy
  const REALTIME_COOLDOWN_MS = 2000; // coalesce realtime bursts
  const UNCHANGED_COOLDOWN_MS = 2000; // don't refetch repeatedly on 304/unchanged
  let realtimeCooldownUntilMs = 0;

  const emit = () => {
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch {
        // ignore
      }
    }
  };

  const logLifecycle = (event: string, data?: Record<string, unknown>) => {
    if (!IS_DEV) return;
    console.log(PREFIX_LIFECYCLE, event, { component: "orchestrator", ...(data ?? {}) });
  };

  const logMetrics = (event: string, data?: Record<string, unknown>) => {
    if (!IS_DEV) return;
    console.log(PREFIX_METRICS, event, { component: "orchestrator", ...(data ?? {}) });
  };

  const setData = (next: ActiveGames, info?: Record<string, unknown>) => {
    store.data = next;
    store.lastUpdatedAt = nowIso();
    touch(store);
    emit();
    if (IS_DEV && info) {
      console.log(PREFIX_METRICS, "state:update", { component: "orchestrator", ...info });
    }
  };

  const setChannelCount = (n: number, reason: string) => {
    store.channelCount = Math.max(0, n);
    touch(store);
    logMetrics("channel", { channelCount: store.channelCount, reason });
  };

  const setPollingState = (activePolling: boolean, intervalMs: number | null, reason: string) => {
    store.pollingState = { active: activePolling, intervalMs };
    touch(store);
    logMetrics("polling", { pollingState: store.pollingState, reason });
  };

  const recomputeTimerCount = () => {
    store.timerCount = Number(Boolean(pollTimer)) + Number(Boolean(realtimeCooldownTimer));
    touch(store);
  };

  const stableRoomsSignature = (rooms: ActiveRoom[]): string => {
    // Keep it cheap and stable: sort by roomId and take a subset of relevant fields.
    const sorted = [...rooms].sort((a, b) => a.roomId.localeCompare(b.roomId));
    return sorted
      .map((r) =>
        [
          r.roomId,
          r.status,
          r.roomCode ?? "",
          String(r.cardPrice ?? ""),
          String(r.cardCount ?? ""),
          String(r.prize ?? ""),
          r.currency ?? "",
        ].join("|")
      )
      .join(";");
  };

  const shouldSkipFetchNow = (source: ActiveGamesFetchSource) => {
    const nowMs = Date.now();
    const lastEndMs = store.lastFetchEndAt ? Date.parse(store.lastFetchEndAt) : 0;
    const sinceLastEnd = lastEndMs ? nowMs - lastEndMs : Infinity;

    // Guard 1: realtime burst cooldown
    if (source === "realtime" && nowMs < realtimeCooldownUntilMs) {
      return { skip: true, reason: "cooldown" as const, waitMs: realtimeCooldownUntilMs - nowMs };
    }

    // Guard 2: unchanged cooldown (304 or identical rooms signature)
    if ((store.lastEtagStatus === 304 || store.lastUnchanged) && sinceLastEnd < UNCHANGED_COOLDOWN_MS) {
      // allow manual to bypass (developer debugging)
      if (source !== "manual") {
        return { skip: true, reason: "unchanged" as const, waitMs: UNCHANGED_COOLDOWN_MS - sinceLastEnd };
      }
    }

    return { skip: false, reason: null as const, waitMs: 0 };
  };

  const scheduleRealtimeCooldownFlush = (localRunId: number) => {
    const nowMs = Date.now();
    const waitMs = Math.max(0, realtimeCooldownUntilMs - nowMs);
    if (waitMs <= 0) return;
    if (realtimeCooldownTimer) return;

    realtimeCooldownTimer = setTimeout(() => {
      realtimeCooldownTimer = null;
      recomputeTimerCount();
      if (!active) return;
      if (localRunId !== runId) return;
      // after cooldown, run a single coalesced fetch if pending reasons exist
      if (pending) {
        void doFetch(localRunId);
      }
    }, waitMs);
    recomputeTimerCount();
  };

  const requestFetch = (source: ActiveGamesFetchSource, opts: { skipEtag: boolean }, localRunId: number) => {
    if (!active) return;
    if (localRunId !== runId) return;

    // record pending reason for metrics visibility
    pendingReasons.add(source);
    store.pendingReasons = new Set(pendingReasons);
    touch(store);

    const guard = shouldSkipFetchNow(source);
    if (guard.skip) {
      logMetrics("fetch:skipped", { source, guard: guard.reason, waitMs: guard.waitMs });
      // If this was a realtime cooldown skip, ensure we have a single timer to flush after cooldown.
      if (guard.reason === "cooldown") {
        scheduleRealtimeCooldownFlush(localRunId);
      }
      return;
    }

    if (store.inFlight > 0) {
      pending = true;
      pendingSkipEtag = pendingSkipEtag || opts.skipEtag;
      logMetrics("fetch:coalesced", { source, skipEtag: opts.skipEtag, inFlight: store.inFlight, pending: true });
      return;
    }

    // fire immediately
    pending = true;
    pendingSkipEtag = pendingSkipEtag || opts.skipEtag;
    void doFetch(localRunId);
  };

  const scheduleNextPoll = (delayMs: number, localRunId: number, reason: string) => {
    if (!active) return;
    if (localRunId !== runId) return;

    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }

    const nextAt = new Date(Date.now() + delayMs).toISOString();
    store.nextPollAt = nextAt;
    touch(store);
    recomputeTimerCount();

    pollTimer = setTimeout(() => {
      pollTimer = null;
      store.nextPollAt = null;
      touch(store);
      recomputeTimerCount();
      if (!active) return;
      if (localRunId !== runId) return;
      requestFetch("polling", { skipEtag: false }, localRunId);
      // schedule next poll (will be adjusted after fetch outcome)
      scheduleNextPoll(store.backoffMs > 0 ? store.backoffMs : BASE_POLL_INTERVAL_MS, localRunId, "tick");
    }, delayMs);

    recomputeTimerCount();
    logMetrics("poll:scheduled", { delayMs, nextAt, reason });
  };

  const doFetch = async (localRunId: number): Promise<void> => {
    if (!active) return;
    if (localRunId !== runId) return;

    if (!pending) return;
    if (store.inFlight > 0) return;

    // choose a "primary" source for logging/metrics
    const reasons = Array.from(pendingReasons);
    const source: ActiveGamesFetchSource =
      reasons.includes("manual") ? "manual" : reasons.includes("realtime") ? "realtime" : reasons.includes("initial") ? "initial" : "polling";
    const skipEtag = pendingSkipEtag || source === "initial" || source === "realtime";

    // clear pending before actual fetch; new triggers can re-add
    pending = false;
    pendingSkipEtag = false;
    pendingReasons = new Set();
    store.pendingReasons = new Set();
    touch(store);

    // orchestrator-local counters
    store.fetchCountBySource[source] = (store.fetchCountBySource[source] ?? 0) + 1;
    store.inFlight += 1;
    store.maxConcurrentInFlight = Math.max(store.maxConcurrentInFlight, store.inFlight);
    store.lastFetchAt = nowIso();
    touch(store);

    // shared dev metrics store (to compare against legacy baseline)
    activeGamesMetrics.fetchStart(source, { component: "orchestrator", skipEtag });

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!active || localRunId !== runId) return;

      if (userError || !user) {
        // match legacy setupSubscription behavior: no error, just stop loading
        setData({ rooms: [], loading: false, error: null }, { reason: "fetch:no-user" });
        store.lastEtagStatus = 200;
        store.lastUnchanged = false;
        store.lastFetchEndAt = nowIso();
        touch(store);
        activeGamesMetrics.fetchEnd(source, 200, { component: "orchestrator", note: "no-user" });
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || null;

      const headers: HeadersInit = {
        "Cache-Control": "no-cache",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      if (!skipEtag && etag) {
        headers["If-None-Match"] = etag;
      }

      // Unified fetch path: Next internal API only
      const res = await fetch("/api/player/my-active-rooms", {
        headers,
        cache: "no-store",
      });

      if (!active || localRunId !== runId) return;

      if (res.status === 304) {
        setData({ rooms: store.data.rooms, loading: false, error: store.data.error }, { reason: "etag-304" });
        store.lastEtagStatus = 304;
        store.lastUnchanged = true;
        store.lastFetchEndAt = nowIso();
        touch(store);
        activeGamesMetrics.fetchEnd(source, 304, { component: "orchestrator" });
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = (await res.json()) as { rooms?: ActiveRoom[] };
      const newEtag = res.headers.get("ETag");
      if (newEtag) etag = newEtag;

      const rooms = Array.isArray(json?.rooms) ? (json.rooms as ActiveRoom[]) : [];
      const sig = stableRoomsSignature(rooms);
      const unchanged = Boolean(store.lastRoomsSig) && store.lastRoomsSig === sig;
      store.lastRoomsSig = sig;
      store.lastUnchanged = unchanged;

      // If unchanged content (even with 200), avoid churn: keep current rooms reference if identical.
      const nextRooms = unchanged ? store.data.rooms : rooms;
      setData(
        { rooms: nextRooms, loading: false, error: null },
        { reason: "fetch-200", roomsCount: rooms.length, unchanged }
      );

      store.lastEtagStatus = 200;
      store.lastFetchEndAt = nowIso();
      touch(store);
      activeGamesMetrics.fetchEnd(source, 200, { component: "orchestrator", roomsCount: rooms.length });

      // Reset polling backoff on success
      store.backoffMs = 0;
      touch(store);
      if (store.pollingState.active) {
        // ensure scheduler follows the reset backoff
        scheduleNextPoll(BASE_POLL_INTERVAL_MS, localRunId, "success-reset");
      }
    } catch (err: any) {
      if (!active || localRunId !== runId) return;
      const msg = String(err?.message ?? err);
      setData({ rooms: store.data.rooms, loading: false, error: msg }, { reason: "fetch-error" });
      store.lastEtagStatus = "errored";
      store.lastUnchanged = false;
      store.lastFetchEndAt = nowIso();
      touch(store);
      activeGamesMetrics.fetchEnd(source, "errored", { component: "orchestrator", error: msg });

      // Backoff for polling stability (caps at 30s). Only affects polling scheduler.
      const prev = store.backoffMs || 0;
      const next = prev > 0 ? Math.min(prev * 2, 30000) : 2000;
      store.backoffMs = next;
      touch(store);
      logMetrics("poll:backoff", { error: msg, backoffMs: next });
      if (store.pollingState.active) {
        // ensure scheduler follows the backoff immediately (prevents hammering after repeated failures)
        scheduleNextPoll(next, localRunId, "failure-backoff");
      }
    } finally {
      store.inFlight = Math.max(0, store.inFlight - 1);
      touch(store);
      // If new triggers arrived during the fetch, run at most one follow-up,
      // but guards can still skip it (etag-304/unchanged/cooldown).
      if (pending && active && localRunId === runId) {
        const followReason =
          store.pendingReasons.has("manual")
            ? "manual"
            : store.pendingReasons.has("realtime")
              ? "realtime"
              : store.pendingReasons.has("initial")
                ? "initial"
                : "polling";
        const guard = shouldSkipFetchNow(followReason);
        if (guard.skip) {
          logMetrics("fetch:skipped", { source: followReason, guard: guard.reason, waitMs: guard.waitMs, when: "follow-up" });
          if (guard.reason === "cooldown") {
            scheduleRealtimeCooldownFlush(localRunId);
          } else {
            // clear follow-up if blocked by unchanged guard
            pending = false;
            pendingSkipEtag = false;
            pendingReasons = new Set();
            store.pendingReasons = new Set();
            touch(store);
          }
        } else {
          void doFetch(localRunId);
        }
      }
    }
  };

  async function initAsync(localRunId: number) {
    // async boundary: must be guarded (StrictMode-safe)
    await new Promise((r) => setTimeout(r, 0));

    if (!active) return;
    if (localRunId !== runId) return;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!active) return;
    if (localRunId !== runId) return;

    if (userError || !user) {
      setData({ rooms: [], loading: false, error: null }, { reason: "init:no-user" });
      logLifecycle("auth-missing", { stage: "init:getUser" });
      return;
    }

    setData({ rooms: store.data.rooms, loading: true, error: null }, { reason: "init:loading" });
    pending = true;
    pendingSkipEtag = true;
    pendingReasons.add("initial");
    store.pendingReasons = new Set(pendingReasons);
    touch(store);
    await doFetch(localRunId);

    if (!active) return;
    if (localRunId !== runId) return;

    // realtime subscription (same as legacy)
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
      channel = null;
      setChannelCount(0, "replaced");
    }

    channel = supabase
      .channel(`my_active_rooms_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
          filter: `player_user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!active) return;
          if (localRunId !== runId) return;
          logMetrics("realtime:tickets", { eventType: (payload as any)?.eventType });
          // Coalesce realtime bursts via cooldown + requestFetch
          realtimeCooldownUntilMs = Math.max(realtimeCooldownUntilMs, Date.now() + REALTIME_COOLDOWN_MS);
          requestFetch("realtime", { skipEtag: true }, localRunId);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms" },
        (payload) => {
          if (!active) return;
          if (localRunId !== runId) return;
          const roomId = (payload.new as any)?.id;
          const newStatus = (payload.new as any)?.status;
          const oldStatus = (payload.old as any)?.status;
          if (roomId && newStatus && newStatus !== oldStatus) {
            const isActiveStatus = ["waiting", "playing", "live", "settling"].includes(newStatus);
            const wasActiveStatus =
              oldStatus && ["waiting", "playing", "live", "settling"].includes(oldStatus);
            if (isActiveStatus || wasActiveStatus) {
              logMetrics("realtime:rooms", { roomId, oldStatus, newStatus });
              realtimeCooldownUntilMs = Math.max(realtimeCooldownUntilMs, Date.now() + REALTIME_COOLDOWN_MS);
              requestFetch("realtime", { skipEtag: true }, localRunId);
            }
          }
        }
      )
      .subscribe((status) => {
        logMetrics("subscription:status", { status });
      });
    setChannelCount(1, "subscribed");

    // polling scheduler (base interval is legacy; backoff is applied on failures)
    setPollingState(true, BASE_POLL_INTERVAL_MS, "started");
    scheduleNextPoll(BASE_POLL_INTERVAL_MS, localRunId, "start");
  }

  function start() {
    if (active) return;
    active = true;
    runId += 1;
    const localRunId = runId;

    installActiveGamesOrchestratorMetricsOnWindow();

    store.initCount += 1;
    store.lastInitAt = nowIso();
    touch(store);

    logLifecycle("mount");
    logMetrics("init", { initCount: store.initCount });

    void initAsync(localRunId);
  }

  function stop() {
    if (!active) return;
    active = false;
    runId += 1;

    logLifecycle("cleanup");

    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
      channel = null;
    }
    setChannelCount(0, "cleanup");

    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (realtimeCooldownTimer) {
      clearTimeout(realtimeCooldownTimer);
      realtimeCooldownTimer = null;
    }
    pending = false;
    pendingSkipEtag = false;
    pendingReasons = new Set();
    realtimeCooldownUntilMs = 0;
    etag = null;
    recomputeTimerCount();
    store.nextPollAt = null;
    store.pendingReasons = new Set<ActiveGamesFetchSource>();
    store.backoffMs = 0;
    touch(store);
    setPollingState(false, null, "cleanup");

    store.lastCleanupAt = nowIso();
    touch(store);

    logLifecycle("unmount");
  }

  return {
    start,
    stop,
    getSnapshot: () => getStore().data,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let singleton: ActiveGamesOrchestrator | null = null;

export function getActiveGamesOrchestrator(): ActiveGamesOrchestrator {
  if (!singleton) {
    singleton = createOrchestrator();
  }
  return singleton;
}


