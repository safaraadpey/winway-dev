import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import type { DrawPerformanceReport } from "./types.js";

export function parseDrawPerformanceLine(
  line: string,
  roomFilter?: Set<string>
): DrawPerformanceReport | null {
  const trimmed = line.trim();
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

export async function ingestLogFile(args: {
  path: string;
  roomFilter: Set<string>;
  seen: Set<string>;
  reports: DrawPerformanceReport[];
}): Promise<number> {
  let file;
  try {
    file = await open(args.path, "r");
  } catch {
    return 0;
  }

  const rl = createInterface({
    input: createReadStream(args.path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let added = 0;
  for await (const line of rl) {
    const report = parseDrawPerformanceLine(line, args.roomFilter);
    if (!report) continue;
    const key = `${report.roomId}:${report.drawId}`;
    if (args.seen.has(key)) continue;
    args.seen.add(key);
    args.reports.push(report);
    added += 1;
  }
  await file.close();
  return added;
}

export async function tailLogFile(args: {
  path: string;
  offset: number;
  roomFilter: Set<string>;
  seen: Set<string>;
  reports: DrawPerformanceReport[];
}): Promise<number> {
  let st;
  try {
    st = await stat(args.path);
  } catch {
    return args.offset;
  }
  if (st.size <= args.offset) return args.offset;

  const file = await open(args.path, "r");
  const buf = Buffer.alloc(st.size - args.offset);
  await file.read(buf, 0, buf.length, args.offset);
  await file.close();

  const chunk = buf.toString("utf8");
  const lines = chunk.split(/\r?\n/);
  let added = 0;
  for (const line of lines) {
    const report = parseDrawPerformanceLine(line, args.roomFilter);
    if (!report) continue;
    const key = `${report.roomId}:${report.drawId}`;
    if (args.seen.has(key)) continue;
    args.seen.add(key);
    args.reports.push(report);
    added += 1;
  }
  return st.size;
}
