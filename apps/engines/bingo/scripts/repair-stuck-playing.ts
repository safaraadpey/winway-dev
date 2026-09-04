/**
 * One-shot repair: drive stale `playing` rooms to completion (draw + settle).
 * Processes rooms sequentially to avoid lease fights with remote engine replicas.
 */
import "dotenv/config";
import { loadConfig } from "../src/config/env.js";
import { createSupabaseAdmin } from "../src/db/supabase-admin.js";
import { getGlobalCardRegistry } from "../src/core/card-registry/index.js";
import { createLogger } from "../src/metrics/logger.js";
import { GameRepo } from "../src/repositories/index.js";
import { RoomStateManager } from "../src/state/index.js";
import { createEngineIdentity } from "../src/runtime/engineIdentity.js";
import { runOneDrawCycle } from "../src/domain/room-loop/runDrawCycle.js";
import { bootstrapRoomForActor } from "../src/domain/room-loop/bootstrapRoom.js";
import { finishExhaustedRoom } from "../src/domain/room/reconcileWinners.js";
import {
  RoomGameActor,
  type RoomCycleResult,
} from "../src/workers/room-loop/roomGameActor.js";
import { claimRoomLease, releaseRoomLease } from "../src/workers/room-loop/roomLease.js";
import { RoomLoopMetrics } from "../src/workers/room-loop/roomLoopMetrics.js";

const REPAIR_OWNER = process.env.REPAIR_OWNER_ID?.trim() || "repair:winway-local";
const LEASE_SEC = Number(process.env.REPAIR_LEASE_SEC ?? "600");
const STALE_SEC = Number(process.env.REPAIR_STALE_SEC ?? "60");
const MAX_CYCLES = Number(process.env.REPAIR_MAX_CYCLES ?? "120");

async function findStalePlayingRooms(repo: GameRepo): Promise<string[]> {
  const { data, error } = await repo["db"]
    .from("rooms")
    .select("id")
    .eq("status", "playing");
  if (error) throw new Error(error.message);

  const ids: string[] = [];
  for (const row of data ?? []) {
    const roomId = (row as { id: string }).id;
    const { data: draws, error: dErr } = await repo["db"]
      .from("draws")
      .select("timestamp")
      .eq("room_id", roomId)
      .order("timestamp", { ascending: false })
      .limit(1);
    if (dErr) throw new Error(dErr.message);
    const ts = (draws?.[0] as { timestamp?: string } | undefined)?.timestamp;
    if (!ts) continue;
    const ageSec = (Date.now() - new Date(ts).getTime()) / 1000;
    if (ageSec >= STALE_SEC) ids.push(roomId);
  }
  return ids;
}

async function waitPersistIdle(actor: RoomGameActor, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const depth = actor.persistQueue.depth();
    if (depth === 0 && !actor.persistQueue.isStopped()) return;
    if (actor.persistQueue.isStopped() && depth === 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`persist queue timeout room=${actor.roomId}`);
}

async function repairRoom(
  repo: GameRepo,
  supabase: ReturnType<typeof createSupabaseAdmin>,
  log: ReturnType<typeof createLogger>,
  config: ReturnType<typeof loadConfig>,
  stateManager: RoomStateManager,
  cardRegistry: NonNullable<Awaited<ReturnType<typeof getGlobalCardRegistry>>>,
  roomId: string
): Promise<"finished" | "drew" | "failed"> {
  const metrics = new RoomLoopMetrics();
  const claim = await claimRoomLease(repo, roomId, {
    ownerId: REPAIR_OWNER,
    leaseSeconds: LEASE_SEC,
  });
  if (!claim.claimed) {
    log.warn("[Repair] claim failed", { roomId });
    return "failed";
  }

  const leaseEpoch =
    claim.leaseEpoch ??
    Number((await repo.getRoom(roomId))?.engine_lease_epoch ?? 1);

  const room = await repo.getRoom(roomId);
  if (!room || room.status !== "playing") {
    await releaseRoomLease(repo, roomId, {
      ownerId: REPAIR_OWNER,
      leaseSeconds: LEASE_SEC,
      leaseEpoch,
    });
    return "finished";
  }

  const actor = new RoomGameActor(
    room,
    "actor",
    {
      supabase,
      repo,
      log,
      config,
      redis: null,
      stateManager,
      ownerId: REPAIR_OWNER,
      leaseSeconds: LEASE_SEC,
      leaseFence: { ownerId: REPAIR_OWNER, leaseEpoch },
      metrics,
      getCardRegistry: () => cardRegistry,
      onExit: () => undefined,
    },
    runOneDrawCycle
  );

  const bootOk = await bootstrapRoomForActor(actor, actor.persistQueue);
  if (!bootOk) {
    log.error("[Repair] bootstrap failed", { roomId });
    await releaseRoomLease(repo, roomId, {
      ownerId: REPAIR_OWNER,
      leaseSeconds: LEASE_SEC,
      leaseEpoch,
    });
    return "failed";
  }

  for (let i = 0; i < MAX_CYCLES; i++) {
    const fresh = await repo.getRoom(roomId);
    if (!fresh || fresh.status !== "playing") break;

    const result: RoomCycleResult = await runOneDrawCycle(actor);
    await waitPersistIdle(actor).catch(() => undefined);

    if (result.kind === "drew" || result.kind === "idle" || result.kind === "backpressure") {
      continue;
    }
    if (result.kind === "exhausted") {
      await finishExhaustedRoom(supabase, repo, log, roomId, stateManager);
      await waitPersistIdle(actor).catch(() => undefined);
      break;
    }
    if (result.kind === "not_owner") {
      log.warn("[Repair] lost lease mid-repair", { roomId });
      return "failed";
    }
  }

  const finalRoom = await repo.getRoom(roomId);
  await releaseRoomLease(repo, roomId, {
    ownerId: REPAIR_OWNER,
    leaseSeconds: LEASE_SEC,
    leaseEpoch,
  });
  stateManager.evict(roomId);

  if (finalRoom && finalRoom.status === "playing") return "drew";
  return "finished";
}

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.logLevel);
  const supabase = createSupabaseAdmin(config);
  const repo = new GameRepo(supabase);
  const stateManager = new RoomStateManager(repo, log, config.roomStateCheckpointEvery);

  process.env.ENGINE_ID = REPAIR_OWNER;
  createEngineIdentity(config);

  log.info("[Repair] loading card registry…");
  const cardRegistry = await getGlobalCardRegistry(repo, log);
  if (!cardRegistry) throw new Error("card registry unavailable");

  const roomIds = await findStalePlayingRooms(repo);
  log.info("[Repair] stale playing rooms", { count: roomIds.length, owner: REPAIR_OWNER });

  let finished = 0;
  let drew = 0;
  let failed = 0;

  for (const roomId of roomIds) {
    const code = (await repo.getRoom(roomId))?.room_code;
    log.info("[Repair] starting room", { roomId, roomCode: code });
    try {
      const outcome = await repairRoom(
        repo,
        supabase,
        log,
        config,
        stateManager,
        cardRegistry,
        roomId
      );
      if (outcome === "finished") finished += 1;
      else if (outcome === "drew") drew += 1;
      else failed += 1;
      log.info("[Repair] room done", { roomId, roomCode: code, outcome });
    } catch (err) {
      failed += 1;
      log.error("[Repair] room error", {
        roomId,
        roomCode: code,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("[Repair] complete", { finished, drew, failed, total: roomIds.length });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
