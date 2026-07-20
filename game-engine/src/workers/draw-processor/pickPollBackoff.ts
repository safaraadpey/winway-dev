import type { PollCycleOutcome } from "./adaptivePollScheduler.js";

/** Ladder: base → 1s → 2s → 5s (deduped/sorted). */
export function buildPickPollBackoffLadder(baseIntervalMs: number): number[] {
  const steps = [baseIntervalMs, 1000, 2000, 5000];
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

/** Fast poll after real draw-picker dispatch work. */
export function shouldResetPickPollFast(outcome: PollCycleOutcome): boolean {
  return (outcome.totalDispatched ?? 0) > 0;
}

/**
 * Idle / contention — increase poll spacing (local timer only, no Redis).
 * Includes lock deferral and empty or non-dispatchable picks.
 */
export function shouldAdvancePickPollBackoff(outcome: PollCycleOutcome): boolean {
  if (shouldResetPickPollFast(outcome)) return false;
  if (outcome.lockDeferred) return true;
  if (outcome.rpcAttemptedEmpty) return true;
  return (outcome.totalDispatched ?? 0) === 0;
}
