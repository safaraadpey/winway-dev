import type { Logger } from "../metrics/logger.js";
import type { GameRedis } from "./types.js";
import { releaseLock, tryAcquireLock } from "./locks.js";

export class RenewableWorkerLock {
  private renewTimer: ReturnType<typeof setInterval> | null = null;
  private lockHeld = false;

  constructor(
    private readonly redis: GameRedis,
    private readonly lockKey: string,
    private readonly token: string,
    private readonly ttlSec: number,
    private readonly renewIntervalMs: number,
    private readonly worker: string,
    private readonly log: Logger
  ) {}

  async acquire(): Promise<boolean> {
    this.lockHeld = await tryAcquireLock(
      this.redis,
      this.lockKey,
      this.ttlSec,
      this.token
    );
    if (this.lockHeld) {
      this.startRenewal();
    }
    return this.lockHeld;
  }

  private startRenewal(): void {
    if (this.renewTimer) return;
    this.renewTimer = setInterval(() => {
      void this.redis
        .renewLock(this.lockKey, this.token, this.ttlSec)
        .catch((err: unknown) => {
          this.log.warn(`${this.worker} lock renew failed`, {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }, this.renewIntervalMs);
  }

  async release(): Promise<void> {
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
    if (!this.lockHeld) return;
    await releaseLock(this.redis, this.lockKey, this.token).catch(() => undefined);
    this.lockHeld = false;
  }
}
