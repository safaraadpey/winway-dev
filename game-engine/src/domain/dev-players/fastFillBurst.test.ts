import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeBurstRoomTarget, initFastFillBurstState } from "./fastFillBurst.js";

describe("fastFillBurst", () => {
  it("caps targetRooms by remaining max_active_rooms capacity", () => {
    const targets = new Set<number>();
    for (let i = 0; i < 50; i += 1) {
      targets.add(
        computeBurstRoomTarget(
          {
            templateId: "t1",
            minActiveRooms: null,
            maxActiveRooms: 10,
            joinIntervalSeconds: 300,
            maxJoinsPerTick: 10,
            minNormalPlayersPerRoom: null,
            maxDevPlayersPerRoom: null,
            quickFillEnabled: true,
          },
          8
        )
      );
    }
    for (const value of targets) {
      assert.ok(value >= 1);
      assert.ok(value <= 2);
    }
  });

  it("initializes burst observability fields and remainingJoins", () => {
    const state = initFastFillBurstState({
      template: {
        id: "t1",
        name: "Room",
        price: 50,
        vip: false,
        roomType: "normal",
        status: "active",
        maxCardsPerPlayer: 3,
        maxPlayers: 8,
      },
      limit: {
        templateId: "t1",
        minActiveRooms: null,
        maxActiveRooms: null,
        joinIntervalSeconds: 300,
        maxJoinsPerTick: 10,
        minNormalPlayersPerRoom: null,
        maxDevPlayersPerRoom: null,
        quickFillEnabled: true,
      },
      runtime: {
        templateId: "t1",
        waitingRoomsCount: 0,
        activeRoomsCount: 0,
        joinTargetDevPlayers: 0,
        joinTargetNormalPlayers: 0,
      },
      availableBotsCount: 10,
      cycleStartedAt: "2026-06-25T10:00:00.000Z",
    });

    assert.equal(state.mode, "fast_fill_burst");
    assert.ok((state.burstRoomsTarget ?? 0) >= 3);
    assert.ok((state.burstRoomsTarget ?? 0) <= 5);
    assert.equal(state.burstJoinsTarget, (state.burstRoomsTarget ?? 0) * 8);
    assert.equal(state.remainingJoins, Math.min(state.burstJoinsTarget ?? 0, 10));
    assert.equal(state.burstJoinsScheduled, 0);
    assert.equal(state.burstJoinsSucceeded, 0);
    assert.equal(state.burstJoinsFailed, 0);
  });
});
