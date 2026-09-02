/**
 * RoomGameActor — owns the draw clock for a single claimed room.
 *
 * One actor per room per replica. It holds the lease (renewing as needed) and
 * fires a draw cycle when the room's next_draw_at is due. The actual per-draw
 * work is injected as a `cycle` function so the same loop drives both:
 *   - shadow mode (Phase 3): observe + parity-check, never insert.
 *   - actor mode  (Phase 4): owner-guarded insert → evaluate → finalize.
 *
 * The loop is self-scheduling via setTimeout (no global poll), which is what
 * gives the actor path its low enqueue→pick latency.
 */
import type { EngineConfig } from "../../config/env.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import type { Logger } from "../../metrics/logger.js";
import type { GameRedis } from "../../redis/types.js";
import type { GameRepo } from "../../repositories/index.js";
import type { RoomRow } from "../../repositories/types.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";
import type { RoomLeaseFence } from "../../coordination/leaseFence.js";
import { msUntilDue } from "../../domain/room-loop/scheduleNextDraw.js";
import { renewRoomLease, shouldRenew } from "./roomLease.js";
import type { RoomLoopMetrics } from "./roomLoopMetrics.js";
import { RoomPersistQueue } from "./roomPersistQueue.js";

export type RoomCycleResult =
  | { kind: "drew"; nextDueMs: number }
  | { kind: "backpressure"; retryMs: number }
  | { kind: "shadow"; nextDueMs: number }
  | { kind: "exhausted" }
  | { kind: "not_owner" }
  | { kind: "idle"; retryMs: number };

export type RoomActorMode = "shadow" | "actor";

export interface RoomActorDeps {
  supabase: SupabaseAdmin;
  repo: GameRepo;
  log: Logger;
  config: EngineConfig;
  redis: GameRedis | null;
  stateManager: RoomStateManager;
  ownerId: string;
  leaseSeconds: number;
  leaseFence: RoomLeaseFence;
  metrics: RoomLoopMetrics;
  getCardRegistry: () => GlobalCardRegistry | null;
  /** Called when the actor stops owning the room (lease lost / finished). */
  onExit: (roomId: string, reason: string, fence: RoomLeaseFence) => void;
}

export type RoomActorCycle = (
  actor: RoomGameActor
) => Promise<RoomCycleResult>;

const MIN_TICK_MS = 25;
const MAX_BACKPRESSURE_RETRY_MS = 250;

export class RoomGameActor {
  readonly roomId: string;
  room: RoomRow;
  readonly mode: RoomActorMode;
  /** Shadow-mode prediction: the number this actor expects to be drawn next. */
  predictedNext: number | null = null;
  /** Highest draw number this actor has observed/inserted. */
  lastSeenDrawCount = 0;
  /** When true, recovery scans DB for unprocessed draws before inserting. */
  needsRecovery = true;
  /** RAM clock authority for next due (may lead rooms.next_draw_at until persist writes). */
  ramNextDrawAtIso: string | null;
  readonly persistQueue: RoomPersistQueue;

  private readonly deps: RoomActorDeps;
  private readonly cycle: RoomActorCycle;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = false;
  private lastRenewMs = Date.now();

  constructor(
    room: RoomRow,
    mode: RoomActorMode,
    deps: RoomActorDeps,
    cycle: RoomActorCycle
  ) {
    this.roomId = room.id;
    this.room = room;
    this.mode = mode;
    this.ramNextDrawAtIso = room.next_draw_at;
    this.deps = deps;
    this.cycle = cycle;
    this.persistQueue =
      mode === "actor"
        ? new RoomPersistQueue(this, (outcome) => this.onPersistOutcome(outcome))
        : (null as unknown as RoomPersistQueue);
  }

  /** Sync RAM clock from the cached room row after bootstrap / DB refresh. */
  syncRamNextDrawAtFromRoom(): void {
    this.ramNextDrawAtIso = this.room.next_draw_at;
  }

  private onPersistOutcome(
    outcome: import("../../domain/draw/processEngineDrawJob.js").EngineJobOutcome
  ): void {
    if (outcome === "fenced") {
      this.metrics.noteLeaseLost();
      this.exit("not-owner");
    }
  }

  /** Called by persist recorder after full-winner settle completes. */
  exitAfterPersist(reason: string): void {
    this.exit(reason);
  }

  get repo(): GameRepo {
    return this.deps.repo;
  }
  get supabase(): SupabaseAdmin {
    return this.deps.supabase;
  }
  get log(): Logger {
    return this.deps.log;
  }
  get stateManager(): RoomStateManager {
    return this.deps.stateManager;
  }
  get config(): EngineConfig {
    return this.deps.config;
  }
  get ownerId(): string {
    return this.deps.ownerId;
  }
  get leaseFence(): RoomLeaseFence {
    return this.deps.leaseFence;
  }
  get metrics(): RoomLoopMetrics {
    return this.deps.metrics;
  }
  get cardRegistry(): GlobalCardRegistry | null {
    return this.deps.getCardRegistry();
  }

  /** Begin the self-scheduling loop. */
  start(): void {
    if (this.stopped) return;
    this.scheduleIn(msUntilDue(this.ramNextDrawAtIso));
  }

  /** Stop the loop (does not release the lease — manager owns that). */
  stop(): void {
    this.stopped = true;
    if (this.mode === "actor") {
      this.persistQueue.stop();
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Mark the lease as freshly renewed (used right after claim). */
  noteLeaseRenewed(now = Date.now()): void {
    this.lastRenewMs = now;
  }

  /** Enable DB recovery scan on the next cycle (claim, backpressure, errors). */
  markNeedsRecovery(): void {
    this.needsRecovery = true;
  }

  /** Skip recovery scan until the next mark (steady-state hot path). */
  clearNeedsRecovery(): void {
    this.needsRecovery = false;
  }

  private scheduleIn(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(
      () => void this.tick(),
      Math.max(MIN_TICK_MS, delayMs)
    );
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      if (!(await this.ensureLease())) {
        this.exit("lease-lost");
        return;
      }

      this.metrics.noteCycle();
      const cycleStarted = Date.now();
      const result = await this.cycle(this);
      const cycleDurationMs = Date.now() - cycleStarted;

      if (result.kind === "drew") {
        this.log.info("room-loop cycle completed", {
          roomId: this.roomId,
          kind: result.kind,
          cycleDurationMs,
        });
      }

      switch (result.kind) {
        case "drew":
        case "shadow":
          this.scheduleIn(result.nextDueMs);
          break;
        case "backpressure":
          this.scheduleIn(Math.min(result.retryMs, MAX_BACKPRESSURE_RETRY_MS));
          break;
        case "idle":
          this.scheduleIn(result.retryMs);
          break;
        case "exhausted":
          this.exit("exhausted");
          break;
        case "not_owner":
          this.metrics.noteLeaseLost();
          this.exit("not-owner");
          break;
      }
    } catch (err) {
      this.metrics.noteError();
      this.markNeedsRecovery();
      this.log.error("room-loop actor cycle error", {
        roomId: this.roomId,
        error: err instanceof Error ? err.message : String(err),
      });
      this.scheduleIn(500);
    } finally {
      this.running = false;
    }
  }

  private async ensureLease(): Promise<boolean> {
    if (!shouldRenew(this.lastRenewMs, this.deps.leaseSeconds)) return true;
    const ok = await renewRoomLease(this.repo, this.roomId, {
      ownerId: this.deps.ownerId,
      leaseSeconds: this.deps.leaseSeconds,
      leaseEpoch: this.deps.leaseFence.leaseEpoch,
    });
    if (ok) {
      this.lastRenewMs = Date.now();
      return true;
    }
    this.metrics.noteLeaseLost();
    return false;
  }

  private exit(reason: string): void {
    this.stop();
    this.deps.onExit(this.roomId, reason, this.deps.leaseFence);
  }
}
