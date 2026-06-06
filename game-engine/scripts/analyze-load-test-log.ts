#!/usr/bin/env node
/**
 * Parse draw-performance lines from engine log and print metrics report.
 * Usage: npx tsx scripts/analyze-load-test-log.ts [log-file]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLoadTestReport,
  formatReportMarkdown,
  percentile,
  countDbQueries,
} from "./load-test/analyze.js";
import { parseDrawPerformanceLine, readLogText } from "./load-test/log-parser.js";
import type { DrawPerformanceReport } from "./load-test/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = process.argv[2] ?? path.join(__dirname, "..", "load-test-engine.log");

const lines = readLogText(logPath).split(/\r?\n/);
const reports: DrawPerformanceReport[] = [];
for (const line of lines) {
  const r = parseDrawPerformanceLine(line);
  if (r) reports.push(r);
}

if (reports.length === 0) {
  console.error("No draw-performance samples in", logPath);
  process.exit(1);
}

const durations = reports.map((r) => r.totalDurationMs);
const dbTotal = reports.reduce((s, r) => s + countDbQueries(r), 0);

const stepAgg = new Map<string, number[]>();
for (const r of reports) {
  for (const [step, t] of Object.entries(r.breakdown)) {
    if (t.durationMs <= 0) continue;
    if (!stepAgg.has(step)) stepAgg.set(step, []);
    stepAgg.get(step)!.push(t.durationMs);
  }
}
const slowest = [...stepAgg.entries()]
  .map(([step, vals]) => ({
    step,
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    p95: percentile(vals, 95),
    max: Math.max(...vals),
  }))
  .sort((a, b) => b.p95 - a.p95)
  .slice(0, 8);

const report = buildLoadTestReport({
  rooms: 20,
  ticketsPerRoom: 200,
  drawIntervalSec: 3,
  minDrawsPerRoom: 50,
  tag: "log-analysis",
  durationSec: 0,
  drawReports: reports,
  queueSamples: [],
  perRoomDrawCounts: Object.fromEntries(
    [...new Set(reports.map((r) => r.roomId))].map((id) => [
      id,
      reports.filter((r) => r.roomId === id).length,
    ])
  ),
  roomConcurrency: 4,
  peakQueueAtEnd: 0,
});

report.draws.samples = reports.length;
report.draws.averageProcessingMs = percentile(durations, 50);
report.draws.p95ProcessingMs = percentile(durations, 95);
report.draws.p99ProcessingMs = percentile(durations, 99);
report.db.estimatedTotalQueries = dbTotal;
report.db.averageQueriesPerDraw = dbTotal / reports.length;
report.slowestOperations = slowest.map((s) => ({
  step: s.step,
  averageMs: Math.round(s.avg * 100) / 100,
  p95Ms: s.p95,
  maxMs: Math.round(s.max * 100) / 100,
}));
report.verdict = {
  passed: report.draws.p95ProcessingMs < 3000,
  backlogDetected: false,
  summary:
    report.draws.p95ProcessingMs < 3000
      ? `P95 ${report.draws.p95ProcessingMs}ms within 3s budget (memory-state path).`
      : `P95 ${report.draws.p95ProcessingMs}ms exceeds 3s interval budget.`,
};

const outDir = path.join(__dirname, "..", "load-test-reports");
const outBase = path.join(outDir, "log-analysis");
writeFileSync(`${outBase}.json`, JSON.stringify({ ...report, slowest }, null, 2));
console.log(formatReportMarkdown(report));
console.log(`\nSamples: ${reports.length}, avg DB queries/draw: ${(dbTotal / reports.length).toFixed(1)}`);
console.log(`Written: ${outBase}.json`);
