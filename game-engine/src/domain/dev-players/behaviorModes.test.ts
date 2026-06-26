import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectBehaviorMode } from "./behaviorModes.js";
import type {
  RoomTemplateSnapshot,
  TemplateLimitSnapshot,
  TemplateRuntimeSnapshot,
} from "./types.js";

const template = (
  maxPlayers: number | null,
  quickFill = true
): RoomTemplateSnapshot => ({
  id: "t1",
  name: "Test",
  price: 100,
  vip: false,
  roomType: "normal",
  status: "active",
  maxCardsPerPlayer: 3,
  maxPlayers,
});

const limit = (overrides: Partial<TemplateLimitSnapshot> = {}): TemplateLimitSnapshot => ({
  templateId: "t1",
  minActiveRooms: null,
  maxActiveRooms: 10,
  joinIntervalSeconds: 300,
  maxJoinsPerTick: 10,
  minNormalPlayersPerRoom: null,
  maxDevPlayersPerRoom: null,
  quickFillEnabled: true,
  ...overrides,
});

const runtime = (overrides: Partial<TemplateRuntimeSnapshot> = {}): TemplateRuntimeSnapshot => ({
  templateId: "t1",
  waitingRoomsCount: 0,
  activeRoomsCount: 0,
  joinTargetDevPlayers: 0,
  joinTargetNormalPlayers: 0,
  ...overrides,
});

describe("selectBehaviorMode", () => {
  it("returns idle when at max_active_rooms", () => {
    assert.equal(
      selectBehaviorMode({
        snapshot: runtime({ activeRoomsCount: 10 }),
        limit: limit({ maxActiveRooms: 10 }),
        template: template(8),
        availableBotsCount: 5,
      }),
      "idle"
    );
  });

  it("returns natural_join_drip when waiting rooms exist", () => {
    assert.equal(
      selectBehaviorMode({
        snapshot: runtime({ waitingRoomsCount: 1 }),
        limit: limit({ quickFillEnabled: true }),
        template: template(8),
        availableBotsCount: 5,
      }),
      "natural_join_drip"
    );
  });

  it("falls back to create_drip_light when quick_fill enabled but max_players is null", () => {
    assert.equal(
      selectBehaviorMode({
        snapshot: runtime(),
        limit: limit({ quickFillEnabled: true }),
        template: template(null),
        availableBotsCount: 5,
      }),
      "create_drip_light"
    );
  });

  it("returns fast_fill_burst when quick_fill enabled and max_players set", () => {
    assert.equal(
      selectBehaviorMode({
        snapshot: runtime(),
        limit: limit({ quickFillEnabled: true }),
        template: template(8),
        availableBotsCount: 5,
      }),
      "fast_fill_burst"
    );
  });

  it("returns create_drip_light when quick_fill disabled", () => {
    assert.equal(
      selectBehaviorMode({
        snapshot: runtime(),
        limit: limit({ quickFillEnabled: false }),
        template: template(8),
        availableBotsCount: 5,
      }),
      "create_drip_light"
    );
  });
});
