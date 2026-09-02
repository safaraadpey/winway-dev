/**
 * room-loop role bootstrap.
 *
 * Drives the room-actor game loop: a RoomLoopManager claims playing rooms and
 * runs a per-room actor that owns the live draw clock (RAM pick → persist recorder).
 *
 *   - legacy_db : idle (cron owns the loop).
 *   - hybrid    : manager runs; shadow only if ENABLE_SHADOW_PARITY=true.
 *   - engine    : runOneDrawCycle owns all playing rooms.
 */
import { getGlobalCardRegistry } from "../../core/card-registry/index.js";
import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import { runOneDrawCycle } from "../../domain/room-loop/runDrawCycle.js";
import { GameRepo } from "../../repositories/index.js";
import { drivesLoops, executesBusinessLogic } from "../../runtime.js";
import type { WorkerContext } from "../context.js";
import { RoomLoopManager } from "./roomLoopManager.js";

export function startRoomLoop(ctx: WorkerContext): () => void {
  const { supabase, config, log, redis, identity, coordination } = ctx;

  if (!drivesLoops(config.runtime)) {
    log.info("room-loop idle (GAME_RUNTIME=legacy_db); cron owns rooms");
    return () => undefined;
  }

  const repo = new GameRepo(supabase);
  let cardRegistry: GlobalCardRegistry | null = null;
  let manager: RoomLoopManager | null = null;

  void getGlobalCardRegistry(repo, log)
    .then((reg) => {
      cardRegistry = reg;
      log.info("room-loop card registry loaded");
      manager = new RoomLoopManager({
        supabase,
        repo,
        log,
        config,
        redis,
        stateManager: ctx.roomState,
        identity,
        engineRegistry: coordination.getRegistry(),
        getCardRegistry: () => cardRegistry,
        actorCycle: executesBusinessLogic(config.runtime)
          ? runOneDrawCycle
          : undefined,
        isDraining: () => coordination.isDraining(),
      });

      coordination.registerRoomLoopDrain(() => manager!.waitForDrain());
      manager.start();
    })
    .catch((err) => {
      log.error("room-loop card registry preload failed — room-loop will not start", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

  return () => {
    void manager?.stop();
  };
}
