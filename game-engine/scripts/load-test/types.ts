export interface StepTiming {
  startTime: string;
  endTime: string;
  durationMs: number;
}

export interface DrawPerformanceReport {
  roomId: string;
  drawId: number;
  drawNumber: number;
  ticketCount: number;
  cardCount: number;
  cardNumberRows: number;
  marksInserted: number;
  marksReadCount: number;
  queueWaitMs: number;
  totalDurationMs: number;
  settled: boolean;
  breakdown: Record<string, StepTiming>;
}
