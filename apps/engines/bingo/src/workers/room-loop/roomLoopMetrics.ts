/**
 * Lightweight in-process counters for the room-actor game loop.
 * Surfaced via heartbeat logs; cheap to read/snapshot.
 */
export interface RoomLoopMetricsSnapshot {
  claimed: number;
  claimFailed: number;
  released: number;
  leaseLost: number;
  cyclesRun: number;
  drawsInserted: number;
  backpressureSkips: number;
  recoveries: number;
  shadowDecisions: number;
  shadowParityMismatch: number;
  errors: number;
  activeRooms: number;
}

export class RoomLoopMetrics {
  private claimed = 0;
  private claimFailed = 0;
  private released = 0;
  private leaseLost = 0;
  private cyclesRun = 0;
  private drawsInserted = 0;
  private backpressureSkips = 0;
  private recoveries = 0;
  private shadowDecisions = 0;
  private shadowParityMismatch = 0;
  private errors = 0;

  noteClaimed(): void {
    this.claimed += 1;
  }
  noteClaimFailed(): void {
    this.claimFailed += 1;
  }
  noteReleased(): void {
    this.released += 1;
  }
  noteLeaseLost(): void {
    this.leaseLost += 1;
  }
  noteCycle(): void {
    this.cyclesRun += 1;
  }
  noteDrawInserted(): void {
    this.drawsInserted += 1;
  }
  noteBackpressure(): void {
    this.backpressureSkips += 1;
  }
  noteRecovery(): void {
    this.recoveries += 1;
  }
  noteShadowDecision(): void {
    this.shadowDecisions += 1;
  }
  noteShadowMismatch(): void {
    this.shadowParityMismatch += 1;
  }
  noteError(): void {
    this.errors += 1;
  }

  snapshot(activeRooms: number): RoomLoopMetricsSnapshot {
    return {
      claimed: this.claimed,
      claimFailed: this.claimFailed,
      released: this.released,
      leaseLost: this.leaseLost,
      cyclesRun: this.cyclesRun,
      drawsInserted: this.drawsInserted,
      backpressureSkips: this.backpressureSkips,
      recoveries: this.recoveries,
      shadowDecisions: this.shadowDecisions,
      shadowParityMismatch: this.shadowParityMismatch,
      errors: this.errors,
      activeRooms,
    };
  }
}
