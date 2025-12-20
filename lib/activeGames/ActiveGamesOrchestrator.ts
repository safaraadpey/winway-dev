/**
 * ActiveGamesOrchestrator (Shadow Mode Skeleton)
 *
 * این ماژول فقط برای lifecycle سالم و observability در dev ساخته می‌شود.
 * در این فاز:
 * - هیچ تغییری در منبع داده UI ایجاد نمی‌کند
 * - هیچ fetch/polling/realtime مربوط به UI را جایگزین نمی‌کند
 * - فقط یک subscription سبک (بدون handler) برای اثبات single-instance + cleanup می‌سازد (dev-only)
 *
 * IMPORTANT: این orchestrator به metrics فعلی useActiveGames دست نمی‌زند تا baseline فعلی خراب نشود.
 */

import { supabase } from "@/lib/supabaseClient";

const IS_DEV = process.env.NODE_ENV !== "production";
const PREFIX_METRICS = "[ActiveGames][Metrics]";
const PREFIX_LIFECYCLE = "[ActiveGames][Lifecycle]";

export interface ActiveGamesOrchestratorSnapshot {
  component: "orchestrator";
  initCount: number;
  channelCount: number; // 0 یا 1
  pollingState: { active: boolean; intervalMs: number | null };
  lastInitAt: string | null;
  lastCleanupAt: string | null;
  updatedAt: string;
}

type Store = {
  initCount: number;
  channelCount: number;
  pollingState: { active: boolean; intervalMs: number | null };
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
      channelCount: 0,
      pollingState: { active: false, intervalMs: null },
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

export function activeGamesOrchestratorSnapshot(): ActiveGamesOrchestratorSnapshot {
  const s = getStore();
  return {
    component: "orchestrator",
    initCount: s.initCount,
    channelCount: s.channelCount,
    pollingState: { ...s.pollingState },
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

  w.__activeGamesOrchestratorMetrics = () => activeGamesOrchestratorSnapshot();
  w.__activeGamesOrchestratorMetricsPrint = (label?: string) => {
    const snap = activeGamesOrchestratorSnapshot();
    console.log(PREFIX_METRICS, "snapshot", { component: "orchestrator", ...(label ? { label } : {}) }, snap);
    return snap;
  };
  w.__activeGamesOrchestratorMetricsReset = () => {
    const s = getStore();
    s.initCount = 0;
    s.channelCount = 0;
    s.pollingState = { active: false, intervalMs: null };
    s.lastInitAt = null;
    s.lastCleanupAt = null;
    touch(s);
    console.log(PREFIX_METRICS, "reset", { component: "orchestrator" }, activeGamesOrchestratorSnapshot());
  };

  console.log(PREFIX_METRICS, "window helpers installed", {
    component: "orchestrator",
    get: "window.__activeGamesOrchestratorMetrics()",
    print: "window.__activeGamesOrchestratorMetricsPrint(label?)",
    reset: "window.__activeGamesOrchestratorMetricsReset()",
  });
}

type OrchestratorHandle = ReturnType<typeof createActiveGamesOrchestrator>;

export function createActiveGamesOrchestrator(): {
  start: () => void;
  stop: () => void;
  snapshot: () => ActiveGamesOrchestratorSnapshot;
} {
  const store = getStore();

  let active = false;
  let runId = 0;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  const logLifecycle = (event: string, data?: Record<string, unknown>) => {
    if (!IS_DEV) return;
    console.log(PREFIX_LIFECYCLE, event, { component: "orchestrator", ...(data ?? {}) });
  };

  const logMetrics = (event: string, data?: Record<string, unknown>) => {
    if (!IS_DEV) return;
    console.log(PREFIX_METRICS, event, { component: "orchestrator", ...(data ?? {}) });
  };

  const setChannelCount = (n: number, reason: string) => {
    store.channelCount = Math.max(0, n);
    touch(store);
    logMetrics("channel", { channelCount: store.channelCount, reason });
  };

  async function initAsync(localRunId: number) {
    // Simulate async init boundary (the core source of leak risk in StrictMode)
    await new Promise((r) => setTimeout(r, 0));

    // Guard: if unmounted or replaced, do nothing (prevents late subscribe/interval creation)
    if (!active) return;
    if (localRunId !== runId) return;

    // Shadow: create a minimal realtime channel in dev to prove single-instance + cleanup.
    // No handlers are attached, and no fetches are triggered.
    if (IS_DEV) {
      // Ensure idempotency even if initAsync is called twice somehow
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
        channel = null;
        setChannelCount(0, "replaced");
      }

      channel = supabase.channel("active_games_orchestrator_shadow").subscribe((status) => {
        logMetrics("subscription:status", { status });
      });
      setChannelCount(1, "subscribed");
    }
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

    // Ensure future async continuations don't create resources
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

    // Shadow skeleton: orchestrator does not start polling in this phase.
    store.pollingState = { active: false, intervalMs: null };

    store.lastCleanupAt = nowIso();
    touch(store);

    logLifecycle("unmount");
  }

  return {
    start,
    stop,
    snapshot: () => activeGamesOrchestratorSnapshot(),
  };
}

export type ActiveGamesOrchestrator = OrchestratorHandle;


