/**
 * RoomLoopManager — discovers claimable playing rooms, claims their lease, and
 * spawns one RoomGameActor per claimed room. It is the only component that
 * acquires/releases leases; actors renew their own.
 */
import type { RoomLeaseFence } from "../../coordination/leaseFence.js";
import type { EngineConfig } from "../../config/env.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import type { Logger } from "../../metrics/logger.js";
import type { EngineRegistry } from "../../redis/engineRegistry.js";
import type { GameRedis } from "../../redis/types.js";
import type { EngineIdentity } from "../../runtime/engineIdentity.js";
import { isValidFence } from "../../coordination/leaseFence.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";
import { bootstrapRoomForActor } from "../../domain/room-loop/bootstrapRoom.js";
import { runShadowCycle } from "../../domain/room-loop/shadowCycle.js";
import {
  RoomGameActor,
  type RoomActorCycle,
  type RoomActorDeps,
  type RoomActorMode,
} from "./roomGameActor.js";
import { claimRoomLease, releaseRoomLease } from "./roomLease.js";
import { RoomLoopMetrics } from "./roomLoopMetrics.js";
import {
  setLiveRoomRamProvider,
  type LiveRoomRamProvider,
  type RamLiveRoomContext,
} from "../../http/liveRoomRamRegistry.js";
import { isManifestRamMode } from "../../repositories/types.js";

export interface RoomLoopManagerOptions {
  supabase: SupabaseAdmin;
  repo: GameRepo;
  log: Logger;
  config: EngineConfig;
  redis: GameRedis | null;
  stateManager: RoomStateManager;
  identity: EngineIdentity;
  engineRegistry: EngineRegistry | null;
  getCardRegistry: () => GlobalCardRegistry | null;
  actorCycle?: RoomActorCycle;
  isDraining?: () => boolean;
}

const HEARTBEAT_MS = 10_000;

export class RoomLoopManager implements LiveRoomRamProvider {
  private readonly opts: RoomLoopManagerOptions;
  private readonly ownerId: string;
  private readonly actors = new Map<string, RoomGameActor>();
  private readonly metrics = new RoomLoopMetrics();
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private discovering = false;
  private stopped = false;
  private draining = false;

  constructor(opts: RoomLoopManagerOptions) {
    this.opts = opts;
    this.ownerId = opts.identity.ownerId;
  }

  start(): void {
    setLiveRoomRamProvider(this);
    this.opts.log.info("room-loop manager starting", {
      ownerId: this.ownerId,
      engineId: this.opts.identity.engineId,
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

  setDraining(): void {
    this.draining = true;
  }

  async waitForDrain(): Promise<void> {
    this.setDraining();
    const deadline = Date.now() + this.opts.config.engineDrainTimeoutMs;
    while (this.actors.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await this.stop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    setLiveRoomRamProvider(null);
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    const entries = [...this.actors.entries()];
    for (const actor of this.actors.values()) actor.stop();
    this.actors.clear();
    await Promise.allSettled(
      entries.map(([roomId, actor]) =>
        this.releaseOwnedRoom(roomId, actor.leaseFence)
      )
    );
  }

  private leaseConfig(fence: RoomLeaseFence) {
    return {
      ownerId: this.ownerId,
      leaseSeconds: this.opts.config.roomLoopLeaseSec,
      leaseEpoch: fence.leaseEpoch,
    };
  }

  private async releaseOwnedRoom(
    roomId: string,
    fence: RoomLeaseFence
  ): Promise<void> {
    await releaseRoomLease(this.opts.repo, roomId, this.leaseConfig(fence)).catch(
      () => undefined
    );
    await this.opts.engineRegistry
      ?.removeRoomRoute(roomId, fence.leaseEpoch)
      .catch(() => undefined);
    this.opts.stateManager.evict(roomId);
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
    if (this.stopped || this.discovering || this.draining) return;
    if (this.opts.isDraining?.()) return;
    this.discovering = true;
    try {
      const claimable = await this.opts.repo.findClaimableRooms(
        this.opts.config.roomLoopMaxActiveRooms || 100
      );
      for (const row of claimable) {
        if (this.stopped || this.draining) break;
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

    const claim = await claimRoomLease(this.opts.repo, roomId, {
      ownerId: this.ownerId,
      leaseSeconds: this.opts.config.roomLoopLeaseSec,
    });
    if (!claim.claimed) {
      this.metrics.noteClaimFailed();
      return;
    }

    let leaseEpoch = claim.leaseEpoch;
    if (leaseEpoch == null || !Number.isFinite(leaseEpoch) || leaseEpoch <= 0) {
      const roomRow = await this.opts.repo.getRoom(roomId);
      leaseEpoch = Number(roomRow?.engine_lease_epoch ?? 1);
    }

    const fence: RoomLeaseFence = { ownerId: this.ownerId, leaseEpoch };
    if (!isValidFence(fence)) {
      await releaseRoomLease(this.opts.repo, roomId, this.leaseConfig(fence));
      return;
    }

    const room = await this.opts.repo.getRoom(roomId);
    if (!room || room.status !== "playing") {
      await releaseRoomLease(this.opts.repo, roomId, this.leaseConfig(fence));
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
      leaseFence: fence,
      metrics: this.metrics,
      getCardRegistry: this.opts.getCardRegistry,
      onExit: (id, reason, fence) => void this.handleExit(id, reason, fence),
    };

    const actor = new RoomGameActor(room, resolved.mode, deps, resolved.cycle);
    actor.noteLeaseRenewed();
    this.actors.set(roomId, actor);

    if (resolved.mode === "actor") {
      if (!this.opts.getCardRegistry()) {
        this.opts.log.warn("room-loop claim skipped: registry not ready", {
          roomId,
        });
        actor.stop();
        this.actors.delete(roomId);
        await releaseRoomLease(this.opts.repo, roomId, this.leaseConfig(fence));
        return;
      }
      const bootOk = await bootstrapRoomForActor(actor, actor.persistQueue);
      if (!bootOk) {
        actor.stop();
        this.actors.delete(roomId);
        await releaseRoomLease(this.opts.repo, roomId, this.leaseConfig(fence));
        return;
      }
    }

    void this.opts.engineRegistry
      ?.publishRoomRoute({
        roomId,
        leaseEpoch: fence.leaseEpoch,
        ttlSec: this.opts.config.roomLoopLeaseSec,
      })
      .catch(() => undefined);
    actor.start();
  }

  private async handleExit(
    roomId: string,
    reason: string,
    fence: RoomLeaseFence
  ): Promise<void> {
    this.actors.delete(roomId);
    this.metrics.noteReleased();
    this.opts.stateManager.evict(roomId);
    this.opts.log.info("room-loop actor exit", { roomId, reason });
    if (reason !== "lease-lost" && reason !== "not-owner") {
      await this.releaseOwnedRoom(roomId, fence);
    } else {
      await this.opts.engineRegistry
        ?.removeRoomRoute(roomId, fence.leaseEpoch)
        .catch(() => undefined);
    }
  }

  /** Engine-resident snapshot for manifest_ram GET /v1/live-room. */
  getRamLiveContext(roomId: string): RamLiveRoomContext | null {
    const actor = this.actors.get(roomId);
    if (!actor) return null;
    if (!isManifestRamMode(actor.room.gameplay_persist_mode)) return null;
    const state = this.opts.stateManager.get(roomId);
    if (!state) return null;
    return {
      state,
      ramNextDrawAtIso: actor.ramNextDrawAtIso,
      eventSeq: state.getDrawnNumbers().length,
    };
  }
}
