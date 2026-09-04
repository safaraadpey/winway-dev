/**
 * Serial persist recorder for one room — writes ClockDrawPayload items in seq order.
 * May lag behind the RAM clock; must never retime or re-evaluate draws.
 */
import type { EngineJobOutcome } from "../../domain/draw/processEngineDrawJob.js";
import type { ClockDrawPayload } from "../../domain/room-loop/clockDrawPayload.js";
import {
  persistClockDrawPayload,
  recoverUnprocessedDrawFromDb,
} from "../../domain/room-loop/persistDrawPayload.js";
import type { RoomGameActor } from "./roomGameActor.js";

function comparePayload(a: ClockDrawPayload, b: ClockDrawPayload): number {
  return a.seq - b.seq || a.number - b.number;
}

type PersistClockDraw = typeof persistClockDrawPayload;

export interface RoomPersistQueueHooks {
  persist?: PersistClockDraw;
  delay?: (ms: number) => Promise<void>;
}

const MAX_PERSIST_RETRIES = 3;

function persistBackoffMs(attempt: number): number {
  return 250 * 2 ** (attempt - 1);
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RoomPersistQueue {
  private readonly queue: ClockDrawPayload[] = [];
  private pumping = false;
  private stopped = false;
  /** In-flight persist (insert or finalize). */
  private inFlight = false;
  private readonly persistFn: PersistClockDraw;
  private readonly delayFn: (ms: number) => Promise<void>;
  /** Persist attempt count per payload seq (survives enqueue sort). */
  private readonly persistAttemptsBySeq = new Map<number, number>();

  constructor(
    private readonly actor: RoomGameActor,
    private readonly onOutcome: (outcome: EngineJobOutcome) => void,
    hooks?: RoomPersistQueueHooks
  ) {
    this.persistFn = hooks?.persist ?? persistClockDrawPayload;
    this.delayFn = hooks?.delay ?? defaultDelay;
  }

  /** RAM payloads waiting for insert/finalize. */
  depth(): number {
    return this.queue.length + (this.inFlight ? 1 : 0);
  }

  isStopped(): boolean {
    return this.stopped;
  }

  stop(): void {
    this.stopped = true;
  }

  enqueue(payload: ClockDrawPayload): void {
    if (this.stopped) return;
    this.queue.push(payload);
    this.queue.sort(comparePayload);
    queueMicrotask(() => {
      this.schedulePump();
    });
  }

  private schedulePump(): void {
    void this.pump().catch((err) => {
      this.actor.log.error("[Room] persist pump rejected", {
        roomId: this.actor.roomId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0 && !this.stopped) {
        const payload = this.queue.shift()!;
        this.inFlight = true;
        try {
          let outcome: EngineJobOutcome;
          try {
            outcome = await this.persistFn(this.actor, payload);
            this.persistAttemptsBySeq.delete(payload.seq);
          } catch (err) {
            const attempt = (this.persistAttemptsBySeq.get(payload.seq) ?? 0) + 1;
            this.persistAttemptsBySeq.set(payload.seq, attempt);

            this.actor.log.warn("[Room] persist failed", {
              roomId: this.actor.roomId,
              drawNumber: payload.number,
              attempt,
              error: err instanceof Error ? err.message : String(err),
            });

            if (attempt <= MAX_PERSIST_RETRIES) {
              this.queue.unshift(payload);
              await this.delayFn(persistBackoffMs(attempt));
              break;
            }

            this.persistAttemptsBySeq.delete(payload.seq);
            this.actor.log.error("[Room] persist retries exhausted", {
              roomId: this.actor.roomId,
              drawNumber: payload.number,
              attempts: attempt,
            });
            this.stop();
            this.actor.markNeedsRecovery();
            this.actor.exitAfterPersist("persist-failed");
            break;
          }

          this.onOutcome(outcome);
          if (outcome === "requeue") {
            this.queue.unshift(payload);
            this.actor.log.warn("room-loop persist requeue", {
              roomId: this.actor.roomId,
              drawNumber: payload.number,
            });
            break;
          }
          if (outcome === "fenced") {
            this.stop();
            break;
          }
          if (payload.fullWinnerThisDraw && outcome === "done") {
            this.stop();
            this.actor.exitAfterPersist("exhausted");
            break;
          }
        } finally {
          this.inFlight = false;
        }
      }
    } finally {
      this.pumping = false;
      if (this.queue.length > 0 && !this.stopped) {
        this.schedulePump();
      }
    }
  }

  /** Drain DB unprocessed rows (inserted, not finalized) before clock starts. */
  async drainUnprocessedFromDb(): Promise<boolean> {
    while (!this.stopped) {
      const oldest = await this.actor.repo.getOldestUnprocessedDraw(
        this.actor.roomId
      );
      if (!oldest) return true;

      this.actor.metrics.noteRecovery();
      this.inFlight = true;
      try {
        const outcome = await recoverUnprocessedDrawFromDb(
          this.actor,
          oldest.number,
          oldest.created_at
        );
        if (outcome === "fenced") return false;
        if (outcome !== "done") return false;
      } finally {
        this.inFlight = false;
      }
    }
    return false;
  }
}
