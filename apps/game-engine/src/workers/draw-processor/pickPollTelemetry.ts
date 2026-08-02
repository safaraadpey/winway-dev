/** In-process draw-picker poll metrics (no Redis). */
export interface PickPollTelemetrySnapshot {
  lockAttemptCount: number;
  lockDeferredCount: number;
  emptyQueuePollCount: number;
  successfulWorkCycles: number;
  lockHeldPickCount: number;
}

export class PickPollTelemetry {
  lockAttemptCount = 0;
  lockDeferredCount = 0;
  emptyQueuePollCount = 0;
  successfulWorkCycles = 0;
  lockHeldPickCount = 0;

  noteLockAttempt(): void {
    this.lockAttemptCount += 1;
  }

  noteLockDeferred(): void {
    this.lockDeferredCount += 1;
  }

  noteEmptyQueuePoll(): void {
    this.emptyQueuePollCount += 1;
  }

  noteSuccessfulWorkCycle(): void {
    this.successfulWorkCycles += 1;
  }

  noteLockHeldPick(): void {
    this.lockHeldPickCount += 1;
  }

  snapshot(): PickPollTelemetrySnapshot {
    return {
      lockAttemptCount: this.lockAttemptCount,
      lockDeferredCount: this.lockDeferredCount,
      emptyQueuePollCount: this.emptyQueuePollCount,
      successfulWorkCycles: this.successfulWorkCycles,
      lockHeldPickCount: this.lockHeldPickCount,
    };
  }
}
