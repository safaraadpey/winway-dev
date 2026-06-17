import { getActiveGamesOrchestrator } from "@/lib/activeGames/ActiveGamesOrchestrator";

/**
 * Stop active-games polling/realtime and clear in-memory room list during hard exit.
 */
export function teardownActiveGamesForExit(): void {
  try {
    const orchestrator = getActiveGamesOrchestrator();
    orchestrator.setEnabled(false, "hard-exit");

    const g = globalThis as Record<string, unknown>;
    const store = g.__ACTIVE_GAMES_ORCHESTRATOR_STORE__ as
      | {
          data: { rooms: []; loading: boolean; error: string | null };
          inFlight: number;
          pendingReasons: Set<unknown>;
          channelCount: number;
          pollingState: { active: boolean; intervalMs: number | null };
          timerCount: number;
          nextPollAt: string | null;
          backoffMs: number;
          emptyBackoffMs: number;
          emptyBackoffStep: number;
          lastRoomsSig: string | null;
          lastUnchanged: boolean;
          lastFetchAt: string | null;
          lastFetchEndAt: string | null;
          lastEtagStatus: 200 | 304 | "errored" | null;
          updatedAt: string;
        }
      | undefined;

    if (store) {
      store.data = { rooms: [], loading: false, error: null };
      store.inFlight = 0;
      store.pendingReasons = new Set();
      store.channelCount = 0;
      store.pollingState = { active: false, intervalMs: null };
      store.timerCount = 0;
      store.nextPollAt = null;
      store.backoffMs = 0;
      store.emptyBackoffMs = 0;
      store.emptyBackoffStep = 0;
      store.lastRoomsSig = null;
      store.lastUnchanged = false;
      store.lastFetchAt = null;
      store.lastFetchEndAt = null;
      store.lastEtagStatus = null;
      store.updatedAt = new Date().toISOString();
    }
  } catch {
    // ignore teardown errors during exit
  }
}
