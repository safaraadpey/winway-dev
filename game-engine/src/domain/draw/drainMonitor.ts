/** Per drain() tick context — shared across batch loops in draw-processor. */
export interface DrainMonitorContext {
  drainStartedAt: string;
  drainStartedMs: number;
}

export function createDrainMonitorContext(): DrainMonitorContext {
  const drainStartedMs = Date.now();
  return {
    drainStartedAt: new Date(drainStartedMs).toISOString(),
    drainStartedMs,
  };
}
