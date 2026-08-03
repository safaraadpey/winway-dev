import { randomUUID } from "node:crypto";
import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { DrawJobPickContext } from "../../domain/draw/drawJobPickContext.js";
import {
  processEngineDrawJob,
  type EngineJobOutcome,
} from "../../domain/draw/processEngineDrawJob.js";
import type { DrawJob } from "../../domain/draw/types.js";
import type { Logger } from "../../metrics/logger.js";
import { redisKeys } from "../../redis/keys.js";
import { releaseLock, tryAcquireLock } from "../../redis/locks.js";
import type { GameRedis } from "../../redis/types.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";

interface QueuedWork {
  job: DrawJob;
  pickContext: DrawJobPickContext;
}

export interface RoomDrawActorDeps {
  supabase: SupabaseAdmin;
  log: Logger;
  repo: GameRepo;
  stateManager: RoomStateManager;
  maxAttempts: number;
  getCardRegistry: () => GlobalCardRegistry | null;
  redis: GameRedis | null;
  drawRoomLockTtlSec: number;
  onOutcome: (outcome: EngineJobOutcome) => void;
}

function compareJobs(a: DrawJob, b: DrawJob): number {
  return (
    a.draw_number - b.draw_number ||
    a.created_at.localeCompare(b.created_at) ||
    a.id - b.id
  );
}

/** Serial draw_jobs processor for one room (in-memory actor). */
export class RoomDrawActor {
  private readonly queue: QueuedWork[] = [];
  private processing = false;
  private stopped = false;

  constructor(
    readonly roomId: string,
    private readonly deps: RoomDrawActorDeps
  ) {}

  enqueue(job: DrawJob, pickContext: DrawJobPickContext): void {
    if (this.stopped) return;
    this.queue.push({ job, pickContext });
    this.queue.sort((a, b) => compareJobs(a.job, b.job));
    queueMicrotask(() => {
      void this.pump();
    });
  }

  isIdle(): boolean {
    return !this.processing && this.queue.length === 0;
  }

  stop(): void {
    this.stopped = true;
  }

  private async pump(): Promise<void> {
    if (this.processing || this.stopped) return;
    this.processing = true;
    try {
      while (this.queue.length > 0 && !this.stopped) {
        const work = this.queue.shift()!;
        const outcome = await this.runOne(work);
        this.deps.onOutcome(outcome);
      }
    } finally {
      this.processing = false;
      if (this.queue.length > 0 && !this.stopped) {
        void this.pump();
      }
    }
  }

  private async runOne(work: QueuedWork): Promise<EngineJobOutcome> {
    const { redis, drawRoomLockTtlSec, supabase, log } = this.deps;
    let lockToken: string | null = null;
    let lockHeld = false;

    if (redis && drawRoomLockTtlSec > 0) {
      lockToken = randomUUID();
      lockHeld = await tryAcquireLock(
        redis,
        redisKeys.drawRoomProcessor(this.roomId),
        drawRoomLockTtlSec,
        lockToken
      );
      if (!lockHeld) {
        const now = new Date().toISOString();
        await supabase
          .from("draw_jobs")
          .update({ status: "queued", updated_at: now })
          .eq("id", work.job.id)
          .eq("status", "processing");
        log.info("draw room lock miss; job requeued", {
          roomId: this.roomId,
          jobId: work.job.id,
        });
        return "requeue";
      }
    }

    try {
      return await processEngineDrawJob(
        supabase,
        log,
        this.deps.repo,
        this.deps.stateManager,
        work.job,
        {
          maxAttempts: this.deps.maxAttempts,
          cardRegistry: this.deps.getCardRegistry(),
          pickContext: work.pickContext,
        }
      );
    } finally {
      if (redis && lockHeld && lockToken) {
        await releaseLock(redis, redisKeys.drawRoomProcessor(this.roomId), lockToken).catch(
          (err: unknown) => {
            log.warn("draw room lock release failed", {
              roomId: this.roomId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        );
      }
    }
  }
}
