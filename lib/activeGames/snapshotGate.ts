/**
 * Snapshot fetch coordination between orchestrator and auxiliary callers.
 * Shared, in-memory, client-only; no side effects beyond a timestamp.
 */

let lastSnapshotFetchMs: number | null = null;
let lastSource: "orchestrator" | "listener" | "legacy" | null = null;

export const SNAPSHOT_GUARD_WINDOW_MS = 2000; // guard window for single-flight

export function noteSnapshotFetched(source: "orchestrator" | "listener" | "legacy") {
  lastSnapshotFetchMs = Date.now();
  lastSource = source;
}

export function hasFreshSnapshot(windowMs = SNAPSHOT_GUARD_WINDOW_MS): boolean {
  if (!lastSnapshotFetchMs) return false;
  return Date.now() - lastSnapshotFetchMs <= windowMs;
}

export function getLastSnapshotSource(): typeof lastSource {
  return lastSource;
}

export function getLastSnapshotFetchedAt(): number | null {
  return lastSnapshotFetchMs;
}

export function resetSnapshotGate(): void {
  lastSnapshotFetchMs = null;
  lastSource = null;
}


