import type { SupabaseAdmin } from "../db/supabase-admin.js";

/** Wall-clock timing for one instrumented step. */
export interface StepTiming {
  startTime: string;
  endTime: string;
  durationMs: number;
}

export type DrawStepBreakdown = {
  rpc_pick_draw_jobs: StepTiming;
  getRoom: StepTiming;
  getRoomTickets: StepTiming;
  getCardNumbers: StepTiming;
  getMarksForTickets: StepTiming;
  getResults: StepTiming;
  evaluateRoomAfterDraw: StepTiming;
  insertMarksForDraw: StepTiming;
  insertResults: StepTiming;
  fn_finish_room_and_settle: StepTiming;
  completeJob: StepTiming;
  stampDrawProcessed: StepTiming;
  rpc_finalize_engine_draw_job: StepTiming;
  aggregateDingForDraw: StepTiming;
};

export type DrawStepKey = keyof DrawStepBreakdown;

const ZERO_TIMING: StepTiming = {
  startTime: "",
  endTime: "",
  durationMs: 0,
};

export function emptyBreakdown(): DrawStepBreakdown {
  return {
    rpc_pick_draw_jobs: { ...ZERO_TIMING },
    getRoom: { ...ZERO_TIMING },
    getRoomTickets: { ...ZERO_TIMING },
    getCardNumbers: { ...ZERO_TIMING },
    getMarksForTickets: { ...ZERO_TIMING },
    getResults: { ...ZERO_TIMING },
    evaluateRoomAfterDraw: { ...ZERO_TIMING },
    insertMarksForDraw: { ...ZERO_TIMING },
    insertResults: { ...ZERO_TIMING },
    fn_finish_room_and_settle: { ...ZERO_TIMING },
    completeJob: { ...ZERO_TIMING },
    stampDrawProcessed: { ...ZERO_TIMING },
    rpc_finalize_engine_draw_job: { ...ZERO_TIMING },
    aggregateDingForDraw: { ...ZERO_TIMING },
  };
}

export async function timedStep<T>(run: () => Promise<T>): Promise<{ result: T; timing: StepTiming }> {
  const startTime = new Date().toISOString();
  const t0 = performance.now();
  const result = await run();
  const durationMs = performance.now() - t0;
  return {
    result,
    timing: {
      startTime,
      endTime: new Date().toISOString(),
      durationMs: roundMs(durationMs),
    },
  };
}

export function timedStepSync<T>(run: () => T): { result: T; timing: StepTiming } {
  const startTime = new Date().toISOString();
  const t0 = performance.now();
  const result = run();
  const durationMs = performance.now() - t0;
  return {
    result,
    timing: {
      startTime,
      endTime: new Date().toISOString(),
      durationMs: roundMs(durationMs),
    },
  };
}

function roundMs(n: number): number {
  return Math.round(n * 100) / 100;
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
  breakdown: DrawStepBreakdown;
}

export function buildDrawPerformanceReport(args: {
  roomId: string;
  drawId: number;
  drawNumber: number;
  ticketCount: number;
  cardCount: number;
  cardNumberRows: number;
  marksInserted: number;
  marksReadCount: number;
  queueWaitMs: number;
  settled: boolean;
  breakdown: DrawStepBreakdown;
}): DrawPerformanceReport {
  const keys = Object.keys(args.breakdown) as DrawStepKey[];
  const totalDurationMs = roundMs(
    keys.reduce((sum, k) => sum + args.breakdown[k].durationMs, 0) + args.queueWaitMs
  );
  return {
    roomId: args.roomId,
    drawId: args.drawId,
    drawNumber: args.drawNumber,
    ticketCount: args.ticketCount,
    cardCount: args.cardCount,
    cardNumberRows: args.cardNumberRows,
    marksInserted: args.marksInserted,
    marksReadCount: args.marksReadCount,
    queueWaitMs: roundMs(args.queueWaitMs),
    totalDurationMs,
    settled: args.settled,
    breakdown: args.breakdown,
  };
}

// ---- rolling aggregates (load-test friendly) --------------------------------

const MAX_SAMPLES = 10_000;
const RATE_WINDOW_MS = 10_000;

interface DrawSample {
  completedAtMs: number;
  totalDurationMs: number;
  queueWaitMs: number;
}

const samples: DrawSample[] = [];

export function recordDrawSample(totalDurationMs: number, queueWaitMs: number): void {
  samples.push({
    completedAtMs: Date.now(),
    totalDurationMs,
    queueWaitMs,
  });
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return roundMs(sorted[idx]!);
}

export interface DrawAggregateMetrics {
  sampleCount: number;
  drawsProcessedPerSecond: number;
  averageDrawProcessingMs: number;
  p95DrawProcessingMs: number;
  p99DrawProcessingMs: number;
  averageQueueWaitMs: number;
  p95QueueWaitMs: number;
}

export function snapshotDrawAggregateMetrics(): DrawAggregateMetrics {
  const now = Date.now();
  const recent = samples.filter((s) => s.completedAtMs >= now - RATE_WINDOW_MS);
  const durations = samples.map((s) => s.totalDurationMs);
  const queueWaits = samples.map((s) => s.queueWaitMs);

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : roundMs(arr.reduce((a, b) => a + b, 0) / arr.length);

  return {
    sampleCount: samples.length,
    drawsProcessedPerSecond: roundMs((recent.length / RATE_WINDOW_MS) * 1000),
    averageDrawProcessingMs: avg(durations),
    p95DrawProcessingMs: percentile(durations, 95),
    p99DrawProcessingMs: percentile(durations, 99),
    averageQueueWaitMs: avg(queueWaits),
    p95QueueWaitMs: percentile(queueWaits, 95),
  };
}

export function resetDrawPerformanceSamples(): void {
  samples.length = 0;
}

// ---- queue / fleet snapshot -------------------------------------------------

export interface DrawQueueMetrics {
  queueLength: number;
  processingLength: number;
  failedLength: number;
  activeRooms: number;
  activeTickets: number;
}

const ACTIVE_ROOM_STATUSES = ["playing", "live", "settling"] as const;
const ACTIVE_TICKET_STATUSES = ["reserved", "confirmed", "consumed"] as const;

export async function fetchDrawQueueMetrics(
  supabase: SupabaseAdmin
): Promise<DrawQueueMetrics> {
  const [queued, processing, failed, roomsRes] = await Promise.all([
    supabase
      .from("draw_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued"),
    supabase
      .from("draw_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "processing"),
    supabase
      .from("draw_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase
      .from("rooms")
      .select("id")
      .in("status", [...ACTIVE_ROOM_STATUSES]),
  ]);

  const roomIds = ((roomsRes.data ?? []) as { id: string }[]).map((r) => r.id);
  let activeTickets = 0;
  if (roomIds.length > 0) {
    const { count, error } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .in("room_id", roomIds)
      .in("reservation_status", [...ACTIVE_TICKET_STATUSES]);
    if (!error) activeTickets = count ?? 0;
  }

  return {
    queueLength: queued.count ?? 0,
    processingLength: processing.count ?? 0,
    failedLength: failed.count ?? 0,
    activeRooms: roomIds.length,
    activeTickets,
  };
}
