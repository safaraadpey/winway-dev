#!/usr/bin/env node
/** Smoke test: requeue stale processing draw_jobs */
import "dotenv/config";
import { loadConfig } from "../src/config/env.js";
import { createSupabaseAdmin } from "../src/db/supabase-admin.js";
import { reapStaleDrawJobs } from "../src/domain/draw/reapStaleJobs.js";
import { createLogger } from "../src/metrics/logger.js";
import { GameRepo } from "../src/repositories/index.js";
import { RoomStateManager } from "../src/state/index.js";

const config = loadConfig();
const log = createLogger("info");
const supabase = createSupabaseAdmin(config);
const repo = new GameRepo(supabase);
const roomState = new RoomStateManager(repo, log, 0);

const { count: before } = await supabase
  .from("draw_jobs")
  .select("id", { count: "exact", head: true })
  .eq("status", "processing");

const result = await reapStaleDrawJobs({
  repo,
  log,
  staleSec: 1,
  roomState,
});

const { count: after } = await supabase
  .from("draw_jobs")
  .select("id", { count: "exact", head: true })
  .eq("status", "processing");

console.log(JSON.stringify({ processingBefore: before, processingAfter: after, ...result }, null, 2));
process.exit(0);
