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

export class RoomPersistQueue {
  private readonly queue: ClockDrawPayload[] = [];
  private pumping = false;
  private stopped = false;
  /** In-flight persist (insert or finalize). */
  private inFlight = false;

  constructor(
    private readonly actor: RoomGameActor,
    private readonly onOutcome: (outcome: EngineJobOutcome) => void
  ) {}

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
      void this.pump();
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
          const outcome = await persistClockDrawPayload(this.actor, payload);
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
        void this.pump();
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
