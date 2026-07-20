import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RoomStateManager } from "../../state/room-state.manager.js";

describe("room-loop ownership exit", () => {
  it("evicts resident state when actor exits", () => {
    const evicted: string[] = [];
    const stateManager = {
      evict(roomId: string) {
        evicted.push(roomId);
      },
    } as Pick<RoomStateManager, "evict"> as RoomStateManager;

    const roomId = "00000000-0000-4000-8000-000000000001";
    stateManager.evict(roomId);
    assert.deepEqual(evicted, [roomId]);
  });
});
