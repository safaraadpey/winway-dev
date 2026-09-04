import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { DrawJobPickContext } from "../../domain/draw/drawJobPickContext.js";
import type { EngineJobOutcome } from "../../domain/draw/processEngineDrawJob.js";
import type { DrawJob } from "../../domain/draw/types.js";
import type { Logger } from "../../metrics/logger.js";
import type { GameRedis } from "../../redis/types.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";
import { RoomDrawActor, type RoomDrawActorDeps } from "./roomDrawActor.js";

export interface RoomDrawActorPoolOptions {
  supabase: SupabaseAdmin;
  log: Logger;
  repo: GameRepo;
  stateManager: RoomStateManager;
  maxAttempts: number;
  deferDing?: boolean;
  getCardRegistry: () => GlobalCardRegistry | null;
  redis: GameRedis | null;
  drawRoomLockTtlSec: number;
  onWorkRequeued: () => void;
}

export class RoomDrawActorPool {
  private readonly actors = new Map<string, RoomDrawActor>();
  private readonly stats = { done: 0, requeued: 0, deadLettered: 0 };

  constructor(private readonly opts: RoomDrawActorPoolOptions) {}

  dispatch(job: DrawJob, pickContext: DrawJobPickContext): void {
    const actor = this.getOrCreate(job.room_id);
    actor.enqueue(job, pickContext);
  }

  getStats(): Readonly<typeof this.stats> {
    return this.stats;
  }

  stop(): void {
    for (const actor of this.actors.values()) {
      actor.stop();
    }
  }

  private getOrCreate(roomId: string): RoomDrawActor {
    let actor = this.actors.get(roomId);
    if (!actor) {
      const deps: RoomDrawActorDeps = {
        supabase: this.opts.supabase,
        log: this.opts.log,
        repo: this.opts.repo,
        stateManager: this.opts.stateManager,
        maxAttempts: this.opts.maxAttempts,
        deferDing: this.opts.deferDing,
        getCardRegistry: this.opts.getCardRegistry,
        redis: this.opts.redis,
        drawRoomLockTtlSec: this.opts.drawRoomLockTtlSec,
        onOutcome: (outcome) => this.recordOutcome(roomId, outcome),
      };
      actor = new RoomDrawActor(roomId, deps);
      this.actors.set(roomId, actor);
    }
    return actor;
  }

  private recordOutcome(roomId: string, outcome: EngineJobOutcome): void {
    if (outcome === "done") {
      this.stats.done += 1;
    } else if (outcome === "requeue") {
      this.stats.requeued += 1;
      this.opts.onWorkRequeued();
    } else {
      this.stats.deadLettered += 1;
    }

    const actor = this.actors.get(roomId);
    if (actor?.isIdle()) {
      this.actors.delete(roomId);
    }
  }
}
