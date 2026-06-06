import type { DrawPerformanceReport } from "./types.js";

const DB_QUERY_STEPS = new Set([
  "rpc_pick_draw_jobs",
  "getRoom",
  "getRoomTickets",
  "getCardNumbers",
  "getMarksForTickets",
  "getResults",
  "insertMarksForDraw",
  "insertResults",
  "fn_finish_room_and_settle",
  "completeJob",
  "stampDrawProcessed",
]);

export interface QueueSample {
  ts: number;
  queued: number;
  processing: number;
}

export interface LoadTestReport {
  scenario: {
    rooms: number;
    ticketsPerRoom: number;
    drawIntervalSec: number;
    minDrawsPerRoom: number;
    tag: string;
    durationSec: number;
  };
  verdict: {
    passed: boolean;
    backlogDetected: boolean;
    summary: string;
  };
  draws: {
    samples: number;
    averageProcessingMs: number;
    p95ProcessingMs: number;
    p99ProcessingMs: number;
    peakQueueSize: number;
    averageQueueSize: number;
    peakQueueWaitMs: number;
    averageQueueWaitMs: number;
  };
  db: {
    estimatedTotalQueries: number;
    averageQueriesPerDraw: number;
  };
  slowestOperations: Array<{
    step: string;
    averageMs: number;
    p95Ms: number;
    maxMs: number;
  }>;
  capacity: {
    observedDrawsPerSecond: number;
    requiredDrawsPerSecond: number;
    estimatedMaxRooms: number;
    roomConcurrencyAssumed: number;
  };
  perRoomDrawCounts: Record<string, number>;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return round(sorted[idx]!);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function countDbQueries(report: DrawPerformanceReport): number {
  let n = 0;
  for (const [step, timing] of Object.entries(report.breakdown)) {
    if (DB_QUERY_STEPS.has(step) && timing.durationMs > 0) n += 1;
    if (step === "stampDrawProcessed" && timing.durationMs > 0) n += 1;
  }
  return n;
}

export function buildLoadTestReport(args: {
  rooms: number;
  ticketsPerRoom: number;
  drawIntervalSec: number;
  minDrawsPerRoom: number;
  tag: string;
  durationSec: number;
  drawReports: DrawPerformanceReport[];
  queueSamples: QueueSample[];
  perRoomDrawCounts: Record<string, number>;
  roomConcurrency: number;
  peakQueueAtEnd: number;
}): LoadTestReport {
  const durations = args.drawReports.map((d) => d.totalDurationMs);
  const queueWaits = args.drawReports.map((d) => d.queueWaitMs);
  const queueSizes = args.queueSamples.map((s) => s.queued);

  const stepAgg = new Map<string, number[]>();
  for (const report of args.drawReports) {
    for (const [step, timing] of Object.entries(report.breakdown)) {
      if (timing.durationMs <= 0) continue;
      if (!stepAgg.has(step)) stepAgg.set(step, []);
      stepAgg.get(step)!.push(timing.durationMs);
    }
  }

  const slowestOperations = [...stepAgg.entries()]
    .map(([step, values]) => ({
      step,
      averageMs: avg(values),
      p95Ms: percentile(values, 95),
      maxMs: round(Math.max(...values)),
    }))
    .sort((a, b) => b.p95Ms - a.p95Ms)
    .slice(0, 10);

  const totalQueries = args.drawReports.reduce((sum, r) => sum + countDbQueries(r), 0);
  const observedDps =
    args.durationSec > 0 ? round(args.drawReports.length / args.durationSec) : 0;
  const requiredDps = round(args.rooms / args.drawIntervalSec);

  const avgProcSec = avg(durations) / 1000;
  const estimatedMaxRooms =
    avgProcSec > 0
      ? Math.floor(args.roomConcurrency * (args.drawIntervalSec / avgProcSec) * 0.85)
      : 0;

  const minRoomDraws = Math.min(...Object.values(args.perRoomDrawCounts));
  const peakQueue = queueSizes.length > 0 ? Math.max(...queueSizes) : 0;
  const avgQueue = avg(queueSizes);
  const backlogDetected = peakQueue > args.rooms * 2 || args.peakQueueAtEnd > args.rooms;

  const allRoomsMetMin = Object.values(args.perRoomDrawCounts).filter(
    (c) => c >= args.minDrawsPerRoom
  ).length;
  const passed =
    allRoomsMetMin >= args.rooms &&
    !backlogDetected &&
    avg(durations) < args.drawIntervalSec * 1000 * 0.9;

  let summary: string;
  if (!passed) {
    if (allRoomsMetMin < args.rooms) {
      summary = `Only ${allRoomsMetMin}/${args.rooms} rooms reached ${args.minDrawsPerRoom} draws.`;
    } else if (backlogDetected) {
      summary = `Backlog detected (peak queue ${peakQueue}, end queue ${args.peakQueueAtEnd}).`;
    } else {
      summary = `Average processing ${avg(durations)}ms exceeds sustainable budget for ${args.drawIntervalSec}s interval.`;
    }
  } else {
    summary = `Engine sustained ${args.rooms} rooms × ${args.ticketsPerRoom} tickets without significant backlog.`;
  }

  return {
    scenario: {
      rooms: args.rooms,
      ticketsPerRoom: args.ticketsPerRoom,
      drawIntervalSec: args.drawIntervalSec,
      minDrawsPerRoom: args.minDrawsPerRoom,
      tag: args.tag,
      durationSec: round(args.durationSec),
    },
    verdict: { passed, backlogDetected, summary },
    draws: {
      samples: args.drawReports.length,
      averageProcessingMs: avg(durations),
      p95ProcessingMs: percentile(durations, 95),
      p99ProcessingMs: percentile(durations, 99),
      peakQueueSize: peakQueue,
      averageQueueSize: avgQueue,
      peakQueueWaitMs: queueWaits.length ? round(Math.max(...queueWaits)) : 0,
      averageQueueWaitMs: avg(queueWaits),
    },
    db: {
      estimatedTotalQueries: totalQueries,
      averageQueriesPerDraw:
        args.drawReports.length > 0
          ? round(totalQueries / args.drawReports.length)
          : 0,
    },
    slowestOperations,
    capacity: {
      observedDrawsPerSecond: observedDps,
      requiredDrawsPerSecond: requiredDps,
      estimatedMaxRooms: Math.max(0, estimatedMaxRooms),
      roomConcurrencyAssumed: args.roomConcurrency,
    },
    perRoomDrawCounts: args.perRoomDrawCounts,
  };
}

export function formatReportMarkdown(report: LoadTestReport): string {
  const lines = [
    `# Load Test Report`,
    ``,
    `## Verdict: ${report.verdict.passed ? "PASS" : "FAIL"}`,
    report.verdict.summary,
    ``,
    `## Scenario`,
    `- Rooms: ${report.scenario.rooms}`,
    `- Tickets/room: ${report.scenario.ticketsPerRoom}`,
    `- Draw interval: ${report.scenario.drawIntervalSec}s`,
    `- Min draws/room: ${report.scenario.minDrawsPerRoom}`,
    `- Tag: \`${report.scenario.tag}\``,
    `- Duration: ${report.scenario.durationSec}s`,
    ``,
    `## Draw processing`,
    `- Samples: ${report.draws.samples}`,
    `- Avg: ${report.draws.averageProcessingMs} ms`,
    `- P95: ${report.draws.p95ProcessingMs} ms`,
    `- P99: ${report.draws.p99ProcessingMs} ms`,
    `- Avg queue wait: ${report.draws.averageQueueWaitMs} ms`,
    `- Peak queue wait: ${report.draws.peakQueueWaitMs} ms`,
    ``,
    `## Queue`,
    `- Peak size: ${report.draws.peakQueueSize}`,
    `- Average size: ${report.draws.averageQueueSize}`,
    `- Backlog: ${report.verdict.backlogDetected ? "yes" : "no"}`,
    ``,
    `## DB (estimated)`,
    `- Total queries: ${report.db.estimatedTotalQueries}`,
    `- Avg queries/draw: ${report.db.averageQueriesPerDraw}`,
    ``,
    `## Slowest operations (p95)`,
    ...report.slowestOperations.map(
      (o) => `- **${o.step}**: avg ${o.averageMs} ms, p95 ${o.p95Ms} ms, max ${o.maxMs} ms`
    ),
    ``,
    `## Capacity estimate`,
    `- Required draws/s: ${report.capacity.requiredDrawsPerSecond}`,
    `- Observed draws/s: ${report.capacity.observedDrawsPerSecond}`,
    `- Est. max rooms @ ${report.scenario.drawIntervalSec}s interval (concurrency=${report.capacity.roomConcurrencyAssumed}): **${report.capacity.estimatedMaxRooms}**`,
  ];
  return lines.join("\n");
}
