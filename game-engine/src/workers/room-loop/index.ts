/**
 * room-loop role bootstrap.
 *
 * Drives the room-actor game loop: a RoomLoopManager claims playing rooms and
 * runs a per-room actor that owns the draw clock. The real per-draw cycle
 * (owner-guarded insert → evaluate → finalize) is provided as `actorCycle`;
 * rooms not gated into actor mode run a shadow (observe-only) cycle.
 *
 *   - legacy_db : idle (cron owns the loop).
 *   - hybrid/engine : the manager runs; per-room gating decides shadow vs actor.
 */
import { getGlobalCardRegistry } from "../../core/card-registry/index.js";
import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import { runOneDrawCycle } from "../../domain/room-loop/runDrawCycle.js";
import { GameRepo } from "../../repositories/index.js";
import { drivesLoops, executesBusinessLogic } from "../../runtime.js";
import type { WorkerContext } from "../context.js";
import { RoomLoopManager } from "./roomLoopManager.js";

export function startRoomLoop(ctx: WorkerContext): () => void {
  const { supabase, config, log, redis } = ctx;

  if (!drivesLoops(config.runtime)) {
    log.info("room-loop idle (GAME_RUNTIME=legacy_db); cron owns rooms");
    return () => undefined;
  }

  const repo = new GameRepo(supabase);
  let cardRegistry: GlobalCardRegistry | null = null;
  void getGlobalCardRegistry(repo, log)
    .then((reg) => {
      cardRegistry = reg;
    })
    .catch((err) => {
      log.warn("room-loop card registry preload failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

  const manager = new RoomLoopManager({
    supabase,
    repo,
    log,
    config,
    redis,
    stateManager: ctx.roomState,
    getCardRegistry: () => cardRegistry,
    // The actor (write) cycle only runs in `engine` runtime; in `hybrid` the
    // manager shadows. Per-room meta.loop_mode='actor' still gates each room.
    actorCycle: executesBusinessLogic(config.runtime) ? runOneDrawCycle : undefined,
  });

  manager.start();

  return () => {
    void manager.stop();
  };
}
