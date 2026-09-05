/**
 * Run: node --import tsx --test lib/liveRoom/engineRamSnapshot.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LiveRoomSnapshot } from "@/services/rooms";
import {
  applyLiveRoomSnapshotUpdate,
  mergeLiveRoomRoomFields,
  preserveLiveRoomCards,
  resolveDrawSource,
  shouldAcceptEngineRamEventSeq,
  shouldRewindRevealCursor,
} from "./engineRamSnapshot.js";

const CARD = {
  ticket_id: "t1",
  player_id: "u1",
  player_name: "Me",
  card_number: 1,
  is_my_card: true,
  card: [[1, 2, 3, 4, 5], [], []] as (number | null)[][],
};

function baseSnapshot(
  overrides: Partial<LiveRoomSnapshot> = {}
): LiveRoomSnapshot {
  return {
    source: "engine_ram",
    eventSeq: 2,
    room: {
      id: "room-1",
      status: "playing",
      room_code: null,
      card_price: 5000,
      currency: "IRR",
      min_players: 2,
      max_cards_per_player: 3,
      started_at: null,
      line_reward_percentage: 0.5,
      full_reward_percentage: 0.5,
      commission_rate: 0,
      gameplay_persist_mode: "manifest_ram",
    },
    draws: [
      { id: "ram-room-1", number: 1, created_at: "t", processed_at: "t" },
      { id: "ram-room-2", number: 2, created_at: "t", processed_at: "t" },
    ],
    cards: [CARD],
    ...overrides,
  };
}

describe("resolveDrawSource", () => {
  it("treats manifest_ram without source as engine_ram ordering", () => {
    assert.equal(
      resolveDrawSource({
        source: undefined,
        room: { gameplay_persist_mode: "manifest_ram" } as LiveRoomSnapshot["room"],
      }),
      "engine_ram"
    );
  });
});

describe("shouldAcceptEngineRamEventSeq", () => {
  it("rejects stale lower eventSeq", () => {
    assert.equal(
      shouldAcceptEngineRamEventSeq(5, 4, { source: "engine_ram" }),
      false
    );
  });

  it("accepts equal and higher eventSeq", () => {
    assert.equal(
      shouldAcceptEngineRamEventSeq(5, 5, { source: "engine_ram" }),
      true
    );
    assert.equal(
      shouldAcceptEngineRamEventSeq(5, 6, { source: "engine_ram" }),
      true
    );
  });

  it("does not apply to per_draw snapshots", () => {
    assert.equal(
      shouldAcceptEngineRamEventSeq(5, 1, { source: undefined }),
      true
    );
  });
});

describe("preserveLiveRoomCards", () => {
  it("keeps prev cards when incoming cards=[]", () => {
    const prev = [CARD];
    const kept = preserveLiveRoomCards(prev, [], {
      source: "engine_ram",
      room: { gameplay_persist_mode: "manifest_ram" } as LiveRoomSnapshot["room"],
    });
    assert.deepEqual(kept, prev);
  });

  it("allows per_draw to use incoming empty list", () => {
    const kept = preserveLiveRoomCards([CARD], [], {
      source: undefined,
      room: { gameplay_persist_mode: "per_draw" } as LiveRoomSnapshot["room"],
    });
    assert.deepEqual(kept, []);
  });
});

describe("applyLiveRoomSnapshotUpdate", () => {
  it("rejects stale engine_ram snapshot without losing prev", () => {
    const prev = baseSnapshot({ eventSeq: 10 });
    const stale = baseSnapshot({
      eventSeq: 8,
      draws: [
        { id: "ram-room-1", number: 1, created_at: "t", processed_at: "t" },
      ],
    });
    const result = applyLiveRoomSnapshotUpdate(prev, stale);
    assert.equal(result.accepted, false);
  });

  it("accepts newer eventSeq and preserves cards on empty incoming", () => {
    const prev = baseSnapshot({ eventSeq: 2 });
    const incoming = baseSnapshot({
      eventSeq: 4,
      cards: [],
      draws: Array.from({ length: 4 }, (_, i) => ({
        id: `ram-room-${i + 1}`,
        number: i + 1,
        created_at: "t",
        processed_at: "t",
      })),
    });
    const result = applyLiveRoomSnapshotUpdate(prev, incoming);
    assert.equal(result.accepted, true);
    assert.equal(result.snapshot.draws.length, 4);
    assert.equal(result.snapshot.cards.length, 1);
  });

  it("preserves financial room fields on draws-only partial update", () => {
    const prev = baseSnapshot({
      eventSeq: 2,
      room: {
        ...baseSnapshot().room,
        card_price: 30_000,
        commission_rate: 0.1,
        line_reward_percentage: 0.1,
        full_reward_percentage: 0.9,
        room_code: "254655",
      },
    });
    const incoming = baseSnapshot({
      eventSeq: 4,
      cards: [],
      room: {
        id: "room-1",
        status: "playing",
        room_code: null,
        gameplay_persist_mode: "manifest_ram",
      } as LiveRoomSnapshot["room"],
      draws: Array.from({ length: 4 }, (_, i) => ({
        id: `ram-room-${i + 1}`,
        number: i + 1,
        created_at: "t",
        processed_at: "t",
      })),
    });
    const result = applyLiveRoomSnapshotUpdate(prev, incoming);
    assert.equal(result.accepted, true);
    assert.equal(result.snapshot.room.card_price, 30_000);
    assert.equal(result.snapshot.room.commission_rate, 0.1);
    assert.equal(result.snapshot.room.line_reward_percentage, 0.1);
    assert.equal(result.snapshot.room.full_reward_percentage, 0.9);
    assert.equal(result.snapshot.room.room_code, "254655");
    assert.equal(result.snapshot.cards.length, 1);
  });
});

describe("shouldRewindRevealCursor", () => {
  it("engine_ram never rewinds", () => {
    assert.equal(shouldRewindRevealCursor(3, 8, "engine_ram"), false);
  });

  it("per_draw rewinds on shorter auth list", () => {
    assert.equal(shouldRewindRevealCursor(3, 8, undefined), true);
  });
});

describe("engine_ram sequence 1..15", () => {
  it("preserves numeric call order through applyLiveRoomSnapshotUpdate", () => {
    const prev = baseSnapshot({ eventSeq: 0, draws: [] });
    const incoming = baseSnapshot({
      eventSeq: 15,
      draws: Array.from({ length: 15 }, (_, i) => ({
        id: `ram-room-${i + 1}`,
        number: i + 1,
        created_at: "t",
        processed_at: "t",
      })),
    });
    const result = applyLiveRoomSnapshotUpdate(prev, incoming);
    assert.equal(result.accepted, true);
    assert.deepEqual(
      result.snapshot.draws.map((d) => d.number),
      Array.from({ length: 15 }, (_, i) => i + 1)
    );
  });
});
