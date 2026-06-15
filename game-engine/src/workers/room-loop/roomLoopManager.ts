/**
 * RoomLoopManager — discovers claimable playing rooms, claims their lease, and
 * spawns one RoomGameActor per claimed room. It is the only component that
 * acquires/releases leases; actors renew their own.
 *
 * In engine runtime the actor cycle owns live draws. Shadow parity (observe-only)
 * is available when ENABLE_SHADOW_PARITY=true and no actor cycle is wired.
 */
import { randomUUID } from "node:crypto";
import type { EngineConfig } from "../../config/env.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import type { Logger } from "../../metrics/logger.js";
import type { GameRedis } from "../../redis/types.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";
import { runShadowCycle } from "../../domain/room-loop/shadowCycle.js";
import {
  RoomGameActor,
  type RoomActorCycle,
  type RoomActorDeps,
  type RoomActorMode,
} from "./roomGameActor.js";
import { claimRoomLease, releaseRoomLease } from "./roomLease.js";
import { RoomLoopMetrics } from "./roomLoopMetrics.js";

export interface RoomLoopManagerOptions {
  supabase: SupabaseAdmin;
  repo: GameRepo;
  log: Logger;
  config: EngineConfig;
  redis: GameRedis | null;
  stateManager: RoomStateManager;
  getCardRegistry: () => GlobalCardRegistry | null;
  /** Per-draw cycle (engine runtime). When omitted, shadow only if enabled. */
  actorCycle?: RoomActorCycle;
}

const HEARTBEAT_MS = 10_000;

export class RoomLoopManager {
  private readonly opts: RoomLoopManagerOptions;
  private readonly ownerId: string;
  private readonly actors = new Map<string, RoomGameActor>();
  private readonly metrics = new RoomLoopMetrics();
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private discovering = false;
  private stopped = false;

  constructor(opts: RoomLoopManagerOptions) {
    this.opts = opts;
    this.ownerId = `${process.env.HOSTNAME ?? "engine"}:${randomUUID().slice(0, 8)}`;
  }

  start(): void {
    this.opts.log.info("room-loop manager starting", {
      ownerId: this.ownerId,
      enableShadowParity: this.opts.config.enableShadowParity,
      hasActorCycle: Boolean(this.opts.actorCycle),
      discoveryMs: this.opts.config.roomLoopDiscoveryMs,
    });
    void this.discover();
    this.discoveryTimer = setInterval(
      () => void this.discover(),
      this.opts.config.roomLoopDiscoveryMs
    );
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    const roomIds = [...this.actors.keys()];
    for (const actor of this.actors.values()) actor.stop();
    this.actors.clear();
    await Promise.allSettled(
      roomIds.map((roomId) =>
        releaseRoomLease(this.opts.repo, roomId, {
          ownerId: this.ownerId,
          leaseSeconds: this.opts.config.roomLoopLeaseSec,
        })
      )
    );
  }

  private heartbeat(): void {
    this.opts.log.info("room-loop heartbeat", {
      ownerId: this.ownerId,
      ...this.metrics.snapshot(this.actors.size),
    });
  }

  private atCapacity(): boolean {
    const max = this.opts.config.roomLoopMaxActiveRooms;
    return max > 0 && this.actors.size >= max;
  }

  private async discover(): Promise<void> {
    if (this.stopped || this.discovering) return;
    this.discovering = true;
    try {
      const claimable = await this.opts.repo.findClaimableRooms(
        this.opts.config.roomLoopMaxActiveRooms || 100
      );
      for (const row of claimable) {
        if (this.stopped) break;
        if (this.actors.has(row.room_id)) continue;
        if (this.atCapacity()) break;
        await this.tryClaimAndSpawn(row.room_id);
      }
    } catch (err) {
      this.metrics.noteError();
      this.opts.log.error("room-loop discovery error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.discovering = false;
    }
  }

  private resolveCycle(): { cycle: RoomActorCycle; mode: RoomActorMode } | null {
    if (this.opts.actorCycle != null) {
      return { cycle: this.opts.actorCycle, mode: "actor" };
    }
    if (this.opts.config.enableShadowParity) {
      return { cycle: runShadowCycle, mode: "shadow" };
    }
    return null;
  }

  private async tryClaimAndSpawn(roomId: string): Promise<void> {
    const resolved = this.resolveCycle();
    if (!resolved) return;

    const claimed = await claimRoomLease(this.opts.repo, roomId, {
      ownerId: this.ownerId,
      leaseSeconds: this.opts.config.roomLoopLeaseSec,
    });
    if (!claimed) {
      this.metrics.noteClaimFailed();
      return;
    }

    const room = await this.opts.repo.getRoom(roomId);
    if (!room || room.status !== "playing") {
      await releaseRoomLease(this.opts.repo, roomId, {
        ownerId: this.ownerId,
        leaseSeconds: this.opts.config.roomLoopLeaseSec,
      });
      return;
    }

    this.metrics.noteClaimed();

    const deps: RoomActorDeps = {
      supabase: this.opts.supabase,
      repo: this.opts.repo,
      log: this.opts.log,
      config: this.opts.config,
      redis: this.opts.redis,
      stateManager: this.opts.stateManager,
      ownerId: this.ownerId,
      leaseSeconds: this.opts.config.roomLoopLeaseSec,
      metrics: this.metrics,
      getCardRegistry: this.opts.getCardRegistry,
      onExit: (id, reason) => void this.handleExit(id, reason),
    };

    const actor = new RoomGameActor(
      room,
      resolved.mode,
      deps,
      resolved.cycle
    );
    actor.noteLeaseRenewed();
    this.actors.set(roomId, actor);
    actor.start();
  }

  private async handleExit(roomId: string, reason: string): Promise<void> {
    this.actors.delete(roomId);
    this.metrics.noteReleased();
    this.opts.log.info("room-loop actor exit", { roomId, reason });
    if (reason !== "lease-lost" && reason !== "not-owner") {
      await releaseRoomLease(this.opts.repo, roomId, {
        ownerId: this.ownerId,
        leaseSeconds: this.opts.config.roomLoopLeaseSec,
      }).catch(() => undefined);
    }
  }
}
