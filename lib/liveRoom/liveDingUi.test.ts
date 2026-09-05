/**
 * Run: node --import tsx --test lib/liveRoom/liveDingUi.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LiveRoomSnapshot } from "@/services/rooms";
import {
  buildPerDrawRevealCredit,
  canApplyLiveDingRevealCredit,
  computePerDrawRevealDingDelta,
  countMatchedMyCardsForDing,
  isRoomLevelDingUi,
  shouldCreditDingOnLiveReveal,
} from "./liveDingUi";

function snapshot(
  overrides: Partial<Omit<LiveRoomSnapshot, "room">> & {
    room?: Partial<LiveRoomSnapshot["room"]>;
    ding_settle_mode?: "per_draw" | "room_level";
  } = {}
): LiveRoomSnapshot {
  const { room: roomOverrides, ding_settle_mode, ...rest } = overrides;
  return {
    room: {
      id: "room-1",
      status: "playing",
      room_code: "1234",
      card_price: 5000,
      currency: "IRR",
      min_players: 2,
      max_cards_per_player: 3,
      started_at: null,
      line_reward_percentage: 0.5,
      full_reward_percentage: 0.5,
      commission_rate: 0,
      ding_per_number: 2,
      ding_settle_mode: ding_settle_mode ?? "per_draw",
      ...(roomOverrides ?? {}),
    },
    draws: [],
    cards: rest.cards ?? [
      {
        ticket_id: "t1",
        player_id: "u1",
        player_name: "Me",
        card_number: 1,
        is_my_card: true,
        card: [
          [1, 2, 3, 4, 5],
          [6, 7, 8, 9, 10],
          [11, 12, 13, 14, 15],
        ],
      },
    ],
    ...rest,
  };
}

describe("liveDingUi room_level guards", () => {
  it("room_level disables live reveal credit path", () => {
    assert.equal(isRoomLevelDingUi("room_level"), true);
    assert.equal(shouldCreditDingOnLiveReveal("room_level"), false);
    assert.equal(canApplyLiveDingRevealCredit("room_level"), false);
  });

  it("room_level + 10 reveals produces zero credits", () => {
    const snap = snapshot({ ding_settle_mode: "room_level" });
    const credits = Array.from({ length: 10 }, (_, i) =>
      buildPerDrawRevealCredit(snap, i + 1)
    );
    assert.deepEqual(credits, Array(10).fill(null));
  });

  it("per_draw still computes reveal credit", () => {
    const snap = snapshot({ ding_settle_mode: "per_draw" });
    const credit = buildPerDrawRevealCredit(snap, 7);
    assert.equal(credit?.revealKey, "room-1:7");
    assert.equal(credit?.delta, 2);
  });

  it("manifest_ram and engine_ram never build mid-game reveal credits", () => {
    const manifest = snapshot({
      ding_settle_mode: "per_draw",
      room: { gameplay_persist_mode: "manifest_ram" },
    });
    assert.equal(buildPerDrawRevealCredit(manifest, 7), null);
    assert.equal(shouldCreditDingOnLiveReveal("per_draw", "manifest_ram"), false);

    const engineRam = snapshot({
      ding_settle_mode: "per_draw",
      source: "engine_ram",
      room: { gameplay_persist_mode: "manifest_ram" },
    });
    assert.equal(buildPerDrawRevealCredit(engineRam, 7), null);
    assert.equal(shouldCreditDingOnLiveReveal("per_draw", "per_draw", "engine_ram"), false);
  });
});

describe("liveDingUi end-of-game ledger", () => {
  it("room_level never builds mid-game reveal credits", () => {
    assert.equal(
      buildPerDrawRevealCredit(snapshot({ ding_settle_mode: "room_level" }), 42),
      null
    );
  });
});

describe("liveDingUi per_draw math", () => {
  it("counts only is_my_card grids", () => {
    const snap = snapshot({
      cards: [
        {
          ticket_id: "t1",
          player_id: "u1",
          player_name: "Me",
          card_number: 1,
          is_my_card: true,
          card: [[7, null, null, null, null], [], []],
        },
        {
          ticket_id: "t2",
          player_id: "u2",
          player_name: "Other",
          card_number: 2,
          is_my_card: false,
          card: [[7, null, null, null, null], [], []],
        },
      ],
    });
    assert.equal(countMatchedMyCardsForDing(snap.cards, 7), 1);
    assert.equal(computePerDrawRevealDingDelta(1, 3), 3);
  });
});
