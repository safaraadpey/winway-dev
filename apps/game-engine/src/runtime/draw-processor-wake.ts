/** In-process wake bus: scheduler → draw-processor without waiting for poll interval. */

export type DrawProcessorWakeReason =
  | "enqueue"
  | "realtime"
  | "poll"
  | "backlog";

type WakeListener = (reason: DrawProcessorWakeReason) => void;

let listener: WakeListener | null = null;

export function registerDrawProcessorWake(fn: WakeListener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function wakeDrawProcessor(
  reason: DrawProcessorWakeReason = "enqueue"
): void {
  listener?.(reason);
}
