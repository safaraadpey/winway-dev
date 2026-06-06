import { readFileSync, statSync } from "node:fs";
import type { DrawPerformanceReport } from "./types.js";

/** PowerShell Tee-Object writes UTF-16 LE on Windows. */
export function readLogText(path: string): string {
  const buf = readFileSync(path);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString("utf16le");
  }
  return buf.toString("utf8");
}

function extractJsonLine(line: string): string {
  const trimmed = line.trim();
  const idx = trimmed.indexOf("{");
  if (idx < 0) return trimmed;
  return trimmed.slice(idx);
}

export function parseDrawPerformanceLine(
  line: string,
  roomFilter?: Set<string>
): DrawPerformanceReport | null {
  const trimmed = extractJsonLine(line);
  if (!trimmed.startsWith("{")) return null;
  try {
    const obj = JSON.parse(trimmed) as {
      message?: string;
      DrawPerformance?: DrawPerformanceReport;
    };
    if (obj.message !== "draw-performance" || !obj.DrawPerformance) return null;
    const report = obj.DrawPerformance;
    if (roomFilter && !roomFilter.has(report.roomId)) return null;
    return report;
  } catch {
    return null;
  }
}

function ingestLines(
  lines: string[],
  roomFilter: Set<string>,
  seen: Set<string>,
  reports: DrawPerformanceReport[]
): number {
  let added = 0;
  for (const line of lines) {
    const report = parseDrawPerformanceLine(line, roomFilter);
    if (!report) continue;
    const key = `${report.roomId}:${report.drawId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reports.push(report);
    added += 1;
  }
  return added;
}

export async function ingestLogFile(args: {
  path: string;
  roomFilter: Set<string>;
  seen: Set<string>;
  reports: DrawPerformanceReport[];
}): Promise<number> {
  try {
    const text = readLogText(args.path);
    return ingestLines(text.split(/\r?\n/), args.roomFilter, args.seen, args.reports);
  } catch {
    return 0;
  }
}

/** Re-scan log file (UTF-16 safe); offset is file size hint only. */
export async function tailLogFile(args: {
  path: string;
  offset: number;
  roomFilter: Set<string>;
  seen: Set<string>;
  reports: DrawPerformanceReport[];
}): Promise<number> {
  try {
    const size = statSync(args.path).size;
    if (size <= args.offset) return args.offset;
    const text = readLogText(args.path);
    ingestLines(text.split(/\r?\n/), args.roomFilter, args.seen, args.reports);
    return size;
  } catch {
    return args.offset;
  }
}
