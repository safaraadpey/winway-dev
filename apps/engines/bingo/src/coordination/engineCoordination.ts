import type { EngineConfig } from "../config/env.js";
import type { Logger } from "../metrics/logger.js";
import type { EngineRegistry } from "../redis/engineRegistry.js";

export interface ReadinessSnapshot {
  ok: boolean;
  draining: boolean;
  redisRequired: boolean;
  redisOk: boolean | null;
  engineId: string;
}

export class EngineCoordination {
  private draining = false;
  private roomLoopDrain: (() => Promise<void>) | null = null;
  private readonly registry: EngineRegistry | null;

  constructor(args: {
    config: EngineConfig;
    log: Logger;
    registry: EngineRegistry | null;
  }) {
    this.registry = args.registry;
    args.registry?.start();
  }

  registerRoomLoopDrain(fn: () => Promise<void>): void {
    this.roomLoopDrain = fn;
  }

  setDraining(): void {
    this.draining = true;
    this.registry?.setDraining(true);
  }

  isDraining(): boolean {
    return this.draining;
  }

  async awaitGracefulDrain(timeoutMs: number, log: Logger): Promise<boolean> {
    log.info("[Coordination] drain started", { timeoutMs });
    this.setDraining();
    if (this.roomLoopDrain) {
      await Promise.race([
        this.roomLoopDrain(),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    }
    await this.registry?.stop().catch(() => undefined);
    log.info("[Coordination] drain finished");
    return true;
  }

  snapshotReadiness(args: {
    config: EngineConfig;
    pingRedis: (() => Promise<boolean>) | null;
  }): ReadinessSnapshot {
    const redisRequired =
      args.config.coordinationStrict || args.config.engineReplicaCount > 1;
    return {
      ok: !this.draining && (!redisRequired || args.pingRedis != null),
      draining: this.draining,
      redisRequired,
      redisOk: null,
      engineId: this.registry?.engineId ?? "unknown",
    };
  }

  getRegistry(): EngineRegistry | null {
    return this.registry;
  }
}
