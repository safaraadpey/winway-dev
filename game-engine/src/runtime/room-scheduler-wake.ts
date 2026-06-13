/**
 * In-process wake bus: draw-processor → room-scheduler.
 *
 * When a draw finalizes (processed_at set), backpressure for that room clears.
 * Instead of waiting for the next scheduler poll interval, the finalize path
 * wakes the scheduler so the next draw is inserted as soon as it is due.
 */

export type RoomSchedulerWakeReason = "finalize" | "promote" | "poll";

type WakeListener = (reason: RoomSchedulerWakeReason) => void;

let listener: WakeListener | null = null;

export function registerRoomSchedulerWake(fn: WakeListener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function wakeRoomScheduler(
  reason: RoomSchedulerWakeReason = "finalize"
): void {
  listener?.(reason);
}
