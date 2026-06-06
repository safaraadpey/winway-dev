/**
 * Process-wide registry of in-memory room runtime state.
 * Single load per room; draw loop reads memory only.
 */

import type { Logger } from "../metrics/logger.js";
import { GameRepo } from "../repositories/index.js";
import { loadRoomSnapshot } from "./loadRoomSnapshot.js";
import { RoomRuntimeState } from "./room-state.js";

export class RoomStateManager {
  private readonly states = new Map<string, RoomRuntimeState>();
  private readonly loading = new Map<string, Promise<RoomRuntimeState>>();

  constructor(
    private readonly repo: GameRepo,
    private readonly log: Logger,
    private readonly checkpointEvery: number
  ) {}

  get(roomId: string): RoomRuntimeState | undefined {
    return this.states.get(roomId);
  }

  has(roomId: string): boolean {
    return this.states.has(roomId);
  }

  /** Load snapshot once; no-op if already resident. */
  async ensureLoaded(roomId: string): Promise<RoomRuntimeState> {
    const existing = this.states.get(roomId);
    if (existing) {
      if (RoomRuntimeState.isBroken(existing)) {
        this.log.warn("room state broken (no card cells); reloading", { roomId });
        this.evict(roomId);
      } else {
        return existing;
      }
    }

    const inflight = this.loading.get(roomId);
    if (inflight) return inflight;

    const promise = this.load(roomId);
    this.loading.set(roomId, promise);
    try {
      return await promise;
    } finally {
      this.loading.delete(roomId);
    }
  }

  /** Fire-and-forget preload after room promotion (errors logged). */
  preload(roomId: string): void {
    void this.ensureLoaded(roomId).catch((err) => {
      this.log.warn("room state preload failed", {
        roomId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  evict(roomId: string): void {
    this.states.delete(roomId);
    this.loading.delete(roomId);
  }

  async maybeCheckpoint(state: RoomRuntimeState): Promise<void> {
    if (this.checkpointEvery <= 0) return;
    if (state.drawsProcessed % this.checkpointEvery !== 0) return;

    const rows: { ticket_id: string; value: number }[] = [];
    for (const [ticketId, values] of state.markedByTicket) {
      for (const value of values) {
        rows.push({ ticket_id: ticketId, value });
      }
    }
    if (rows.length === 0) return;

    const now = new Date().toISOString();
    await this.repo.insertMarksForDraw(rows, now);
    this.log.info("room state checkpoint", {
      roomId: state.roomId,
      drawsProcessed: state.drawsProcessed,
      marksSynced: rows.length,
    });
  }

  private async load(roomId: string): Promise<RoomRuntimeState> {
    const { state, loadDurationMs } = await loadRoomSnapshot(this.repo, roomId);
    this.states.set(roomId, state);
    this.log.info("room state loaded", { roomId, loadDurationMs, tickets: state.getTickets().length });
    return state;
  }
}
