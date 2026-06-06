#!/usr/bin/env node
/**
 * Engine-mode draw load test.
 *
 * Scenario (defaults): 20 rooms × 200 tickets, 3s draw interval, ≥50 draws/room.
 *
 * Prerequisites:
 *   1. Apply sql/migrations/20260607120000_load_test_seed_playing_rooms.sql
 *   2. game-engine running with GAME_RUNTIME=engine
 *   3. Enough cards per room in active pool (tickets/room, reusable across rooms)
 *
 * Usage:
 *   cd game-engine
 *   npm run load-test:draw -- --log-file ./load-test-engine.log
 *
 * Capture engine logs:
 *   npm run dev 2>&1 | Tee-Object -FilePath load-test-engine.log
 */
import { spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  buildLoadTestReport,
  formatReportMarkdown,
} from "./load-test/analyze.js";
import { ingestLogFile, parseDrawPerformanceLine, tailLogFile } from "./load-test/log-parser.js";
import type { DrawPerformanceReport } from "./load-test/types.js";
import type { QueueSample } from "./load-test/analyze.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT, ".env") });

interface CliOptions {
  rooms: number;
  ticketsPerRoom: number;
  drawIntervalSec: number;
  minDrawsPerRoom: number;
  logFile: string | null;
  spawnEngine: boolean;
  cleanup: boolean;
  keepData: boolean;
  timeoutSec: number;
  pollIntervalMs: number;
  healthUrl: string;
}

function parseArgs(argv: string[]): CliOptions {
  const get = (name: string, fallback: string) => {
    const eq = argv.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.split("=").slice(1).join("=");
    const idx = argv.indexOf(`--${name}`);
    if (idx >= 0) {
      const next = argv[idx + 1];
      if (next && !next.startsWith("--")) return next;
    }
    return fallback;
  };
  const flag = (name: string) => argv.includes(`--${name}`);

  const rooms = Number(get("rooms", "20"));
  const ticketsPerRoom = Number(get("tickets", "200"));
  const drawIntervalSec = Number(get("interval", "3"));
  const minDrawsPerRoom = Number(get("min-draws", "50"));
  const roomConcurrency = Number(
    process.env.DRAW_PROCESSOR_ROOM_CONCURRENCY ?? "4"
  );
  const timeoutSec = Number(
    get(
      "timeout",
      String(
        Math.ceil(
          minDrawsPerRoom *
            drawIntervalSec *
            Math.max(1, rooms / roomConcurrency) *
            2.5 +
            600
        )
      )
    )
  );

  return {
    rooms,
    ticketsPerRoom,
    drawIntervalSec,
    minDrawsPerRoom,
    logFile: get("log-file", "") || null,
    spawnEngine: flag("spawn-engine"),
    cleanup: !flag("no-cleanup"),
    keepData: flag("keep-data"),
    timeoutSec,
    pollIntervalMs: Number(get("poll-ms", "1000")),
    healthUrl: get("health-url", `http://127.0.0.1:${process.env.GAME_ENGINE_HTTP_PORT ?? "8080"}/health`),
  };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function checkHealth(url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Health check failed: ${res.status} ${url}`);
  const body = (await res.json()) as { ok?: boolean; service?: string };
  if (!body.ok) throw new Error(`Health body not ok: ${JSON.stringify(body)}`);
  console.log(`[preflight] game-engine healthy (${body.service ?? "unknown"})`);
}

async function countQueuedJobs(
  supabase: ReturnType<typeof createClient>,
  roomIds: string[]
): Promise<{ queued: number; processing: number }> {
  const [queued, processing] = await Promise.all([
    supabase
      .from("draw_jobs")
      .select("id", { count: "exact", head: true })
      .in("room_id", roomIds)
      .eq("status", "queued"),
    supabase
      .from("draw_jobs")
      .select("id", { count: "exact", head: true })
      .in("room_id", roomIds)
      .eq("status", "processing"),
  ]);
  return {
    queued: queued.count ?? 0,
    processing: processing.count ?? 0,
  };
}

async function countProcessedDrawsPerRoom(
  supabase: ReturnType<typeof createClient>,
  roomIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(
    roomIds.map((id) => [id, 0])
  );
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("draws")
      .select("room_id")
      .in("room_id", roomIds)
      .not("processed_at", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      const id = (row as { room_id: string }).room_id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return counts;
}

function allRoomsMetMin(
  counts: Record<string, number>,
  roomIds: string[],
  min: number
): boolean {
  return roomIds.every((id) => (counts[id] ?? 0) >= min);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function spawnEngineProcess(
  onLine: (line: string) => void
): ReturnType<typeof spawn> {
  console.log("[spawn] starting game-engine (npm run dev)…");
  const child = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GAME_RUNTIME: "engine" },
  });
  const attach = (stream: NodeJS.ReadableStream | null) => {
    if (!stream) return;
    stream.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) onLine(line);
      }
    });
  };
  attach(child.stdout);
  attach(child.stderr);
  child.on("exit", (code) => {
    console.log(`[spawn] game-engine exited code=${code ?? "?"}`);
  });
  return child;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const roomConcurrency = Number(process.env.DRAW_PROCESSOR_ROOM_CONCURRENCY ?? "4");

  console.log("[load-test] scenario", {
    rooms: opts.rooms,
    ticketsPerRoom: opts.ticketsPerRoom,
    drawIntervalSec: opts.drawIntervalSec,
    minDrawsPerRoom: opts.minDrawsPerRoom,
    timeoutSec: opts.timeoutSec,
  });

  if (!opts.spawnEngine) {
    await checkHealth(opts.healthUrl);
  } else if (process.env.GAME_RUNTIME && process.env.GAME_RUNTIME !== "engine") {
    console.warn("[warn] GAME_RUNTIME is not engine; spawn uses engine anyway");
  }

  if (opts.cleanup) {
    console.log("[setup] cleaning previous load_test rooms…");
    const { error } = await supabase.rpc("load_test_cleanup", { p_tag: null });
    if (error && !error.message.includes("Could not find the function")) {
      console.warn("[setup] cleanup warning:", error.message);
    }
  }

  console.log("[setup] seeding playing rooms…");
  const { data: seedData, error: seedError } = await supabase.rpc(
    "load_test_seed_playing_rooms",
    {
      p_room_count: opts.rooms,
      p_tickets_per_room: opts.ticketsPerRoom,
      p_draw_interval_sec: opts.drawIntervalSec,
      p_tag: null,
    }
  );

  if (seedError) {
    if (seedError.message.includes("Could not find the function")) {
      console.error(
        "Migration missing. Apply sql/migrations/20260607120000_load_test_seed_playing_rooms.sql first."
      );
    }
    if (seedError.message.includes("insufficient pool cards per room")) {
      console.error(
        `Pool too small for ${opts.ticketsPerRoom} tickets/room ` +
          `(cards are unique per room, not globally). Reduce --tickets or expand pool card_no<=200 set.`
      );
    }
    throw seedError;
  }

  const seed = seedData as {
    tag: string;
    room_ids: string[];
  };
  const tag = seed.tag;
  const roomIds = seed.room_ids;
  const roomFilter = new Set(roomIds);

  console.log("[setup] seeded", { tag, roomCount: roomIds.length });

  const drawReports: DrawPerformanceReport[] = [];
  const seenReports = new Set<string>();
  let logOffset = 0;

  const onLogLine = (line: string) => {
    const report = parseDrawPerformanceLine(line, roomFilter);
    if (!report) return;
    const key = `${report.roomId}:${report.drawId}`;
    if (seenReports.has(key)) return;
    seenReports.add(key);
    drawReports.push(report);
  };

  let engineChild: ReturnType<typeof spawn> | null = null;
  if (opts.spawnEngine) {
    engineChild = spawnEngineProcess(onLogLine);
    await sleep(3000);
    await checkHealth(opts.healthUrl);
  } else if (opts.logFile) {
    await ingestLogFile({
      path: opts.logFile,
      roomFilter,
      seen: seenReports,
      reports: drawReports,
    });
    try {
      logOffset = (await stat(opts.logFile)).size;
    } catch {
      logOffset = 0;
    }
    console.log(`[monitor] tailing log file ${opts.logFile}`);
  } else {
    console.warn(
      "[warn] No --log-file or --spawn-engine: step timings / DB query counts will be empty. " +
        "Redirect engine stdout to a file for full report."
    );
  }

  const queueSamples: QueueSample[] = [];
  const startedAt = Date.now();
  let peakQueueAtEnd = 0;
  let lastProgressLog = 0;

  while (Date.now() - startedAt < opts.timeoutSec * 1000) {
    if (opts.logFile) {
      logOffset = await tailLogFile({
        path: opts.logFile,
        offset: logOffset,
        roomFilter,
        seen: seenReports,
        reports: drawReports,
      });
    }

    const [queue, perRoom] = await Promise.all([
      countQueuedJobs(supabase, roomIds),
      countProcessedDrawsPerRoom(supabase, roomIds),
    ]);

    queueSamples.push({
      ts: Date.now(),
      queued: queue.queued,
      processing: queue.processing,
    });

    const minCount = Math.min(...roomIds.map((id) => perRoom[id] ?? 0));
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (Date.now() - lastProgressLog > 10_000) {
      console.log(
        `[monitor] t=${elapsed}s minDraws=${minCount}/${opts.minDrawsPerRoom} ` +
          `queue=${queue.queued} processing=${queue.processing} perfSamples=${drawReports.length}`
      );
      lastProgressLog = Date.now();
    }

    if (
      allRoomsMetMin(perRoom, roomIds, opts.minDrawsPerRoom) &&
      queue.queued === 0 &&
      queue.processing === 0
    ) {
      console.log("[monitor] all rooms met min draws and queue drained");
      break;
    }

    await sleep(opts.pollIntervalMs);
  }

  const finalQueue = await countQueuedJobs(supabase, roomIds);
  peakQueueAtEnd = finalQueue.queued + finalQueue.processing;
  const perRoomDrawCounts = await countProcessedDrawsPerRoom(supabase, roomIds);
  const durationSec = (Date.now() - startedAt) / 1000;

  if (engineChild) {
    engineChild.kill("SIGTERM");
  }

  const report = buildLoadTestReport({
    rooms: opts.rooms,
    ticketsPerRoom: opts.ticketsPerRoom,
    drawIntervalSec: opts.drawIntervalSec,
    minDrawsPerRoom: opts.minDrawsPerRoom,
    tag,
    durationSec,
    drawReports,
    queueSamples,
    perRoomDrawCounts,
    roomConcurrency,
    peakQueueAtEnd,
  });

  const reportsDir = path.join(ROOT, "load-test-reports");
  await mkdir(reportsDir, { recursive: true });
  const base = path.join(reportsDir, tag);
  await writeFile(`${base}.json`, JSON.stringify(report, null, 2), "utf8");
  await writeFile(`${base}.md`, formatReportMarkdown(report), "utf8");

  console.log("\n" + formatReportMarkdown(report));
  console.log(`\n[report] written to ${base}.json and ${base}.md`);

  if (!opts.keepData) {
    console.log("[cleanup] removing load test data…");
    await supabase.rpc("load_test_cleanup", { p_tag: tag });
  }

  process.exit(report.verdict.passed ? 0 : 1);
}

main().catch((err) => {
  console.error("[load-test] failed:", err);
  process.exit(1);
});
