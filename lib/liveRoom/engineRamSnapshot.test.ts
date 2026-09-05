/**
 * Run: node --import tsx --test lib/liveRoom/engineRamSnapshot.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LiveRoomSnapshot } from "@/services/rooms";
import type { ProcessedDraw } from "@/lib/draw-order";
import {
  applyLiveRoomSnapshotUpdate,
  isManifestRamEngineOnlyPhase,
  preserveLiveRoomCards,
  resolveDrawSource,
  shouldAcceptEngineRamEventSeq,
  shouldRewindRevealCursor,
  shouldSyncWinnersDisplayFromDb,
  shouldUsePgLiveDrawUpdates,
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
        room_name: "پنج هزار",
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
    assert.equal(result.snapshot.room.room_name, "پنج هزار");
    assert.equal(result.snapshot.cards.length, 1);
  });

  it("ignores pending draws when source is engine_ram", () => {
    const prev = baseSnapshot({
      eventSeq: 2,
      draws: [
        { id: "ram-room-1", number: 1, created_at: "t", processed_at: "t" },
        { id: "ram-room-2", number: 2, created_at: "t", processed_at: "t" },
      ],
    });
    const incoming = baseSnapshot({
      eventSeq: 4,
      draws: [
        { id: "ram-room-1", number: 1, created_at: "t", processed_at: "t" },
        { id: "ram-room-2", number: 2, created_at: "t", processed_at: "t" },
        { id: "ram-room-3", number: 3, created_at: "t", processed_at: "t" },
      ],
    });
    const pgDraw: ProcessedDraw = {
      id: "pg-99",
      number: 99,
      created_at: "t2",
      processed_at: "t2",
    };
    const result = applyLiveRoomSnapshotUpdate(prev, incoming, {
      pendingDraws: [pgDraw],
    });
    assert.equal(result.accepted, true);
    assert.deepEqual(
      result.snapshot.draws.map((d) => d.number),
      [1, 2, 3]
    );
  });
});

describe("shouldUsePgLiveDrawUpdates", () => {
  it("returns false for engine_ram and manifest_ram", () => {
    assert.equal(
      shouldUsePgLiveDrawUpdates({
        source: "engine_ram",
        room: { gameplay_persist_mode: "manifest_ram" } as LiveRoomSnapshot["room"],
      }),
      false
    );
    assert.equal(
      shouldUsePgLiveDrawUpdates({
        source: undefined,
        room: { gameplay_persist_mode: "manifest_ram" } as LiveRoomSnapshot["room"],
      }),
      false
    );
  });

  it("returns true for per_draw", () => {
    assert.equal(
      shouldUsePgLiveDrawUpdates({
        source: undefined,
        room: { gameplay_persist_mode: "per_draw" } as LiveRoomSnapshot["room"],
      }),
      true
    );
  });
});

describe("shouldSyncWinnersDisplayFromDb", () => {
  it("skips PG results during manifest_ram play", () => {
    assert.equal(shouldSyncWinnersDisplayFromDb(baseSnapshot()), false);
  });

  it("allows PG results after manifest_ram finish", () => {
    assert.equal(
      shouldSyncWinnersDisplayFromDb(
        baseSnapshot({
          room: { ...baseSnapshot().room, status: "finished" },
        })
      ),
      true
    );
  });

  it("still syncs per_draw from PG during play", () => {
    assert.equal(
      shouldSyncWinnersDisplayFromDb({
        source: undefined,
        room: {
          gameplay_persist_mode: "per_draw",
          status: "playing",
        } as LiveRoomSnapshot["room"],
      }),
      true
    );
  });
});

describe("applyLiveRoomSnapshotUpdate winners", () => {
  it("keeps RAM line winners when draws-only poll omits them", () => {
    const prev = baseSnapshot({
      eventSeq: 2,
      line_winners: [{ ticketId: "t1", userId: "u1", drawNumber: 37 }],
    });
    const incoming = baseSnapshot({
      eventSeq: 4,
      line_winners: undefined,
      full_winners: undefined,
    });
    delete incoming.line_winners;
    delete incoming.full_winners;
    const result = applyLiveRoomSnapshotUpdate(prev, incoming);
    assert.equal(result.accepted, true);
    assert.deepEqual(result.snapshot.line_winners, [
      { ticketId: "t1", userId: "u1", drawNumber: 37 },
    ]);
  });

  it("keeps tournament identity when draws-only poll omits it", () => {
    const prev = baseSnapshot({
      eventSeq: 2,
      is_tournament: true,
      tournament: { id: "tour-1", title: "تورنومنت", round_no: 1 },
    });
    const incoming = baseSnapshot({
      eventSeq: 4,
      tournament: undefined,
      is_tournament: undefined,
    });
    delete incoming.tournament;
    delete incoming.is_tournament;
    const result = applyLiveRoomSnapshotUpdate(prev, incoming);
    assert.equal(result.accepted, true);
    assert.equal(result.snapshot.is_tournament, true);
    assert.equal(result.snapshot.tournament?.id, "tour-1");
  });

  it("accepts new RAM line winners from draws poll", () => {
    const prev = baseSnapshot({ eventSeq: 2, line_winners: [] });
    const incoming = baseSnapshot({
      eventSeq: 5,
      line_winners: [{ ticketId: "t1", userId: "u1", drawNumber: 37 }],
    });
    const result = applyLiveRoomSnapshotUpdate(prev, incoming);
    assert.equal(result.accepted, true);
    assert.deepEqual(result.snapshot.line_winners, [
      { ticketId: "t1", userId: "u1", drawNumber: 37 },
    ]);
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

describe("applyLiveRoomSnapshotUpdate post-finish PG catch-up", () => {
  it("keeps cards and does not balloon RAM+PG draw ids (1BAD36)", () => {
    const ramDraws = Array.from({ length: 73 }, (_, i) => ({
      id: `ram-room-${i + 1}`,
      number: i + 1,
      created_at: "t",
      processed_at: "t",
    }));
    const prev = baseSnapshot({
      eventSeq: 80,
      draws: ramDraws,
      cards: [CARD],
    });
    const incoming: LiveRoomSnapshot = {
      source: undefined,
      eventSeq: undefined,
      room: {
        id: "room-1",
        status: "finished",
      } as LiveRoomSnapshot["room"],
      cards: [],
      draws: Array.from({ length: 88 }, (_, i) => ({
        id: `aaaaaaaa-bbbb-cccc-dddd-${String(i + 1).padStart(12, "0")}`,
        number: i + 1,
        created_at: "t",
        processed_at: "t",
      })),
    };
    const result = applyLiveRoomSnapshotUpdate(prev, incoming);
    assert.equal(result.accepted, true);
    assert.equal(result.snapshot.cards.length, 1);
    assert.equal(result.snapshot.draws.length, 88);
    assert.deepEqual(
      result.snapshot.draws.map((d) => d.number).slice(0, 73),
      ramDraws.map((d) => d.number)
    );
    assert.equal(result.snapshot.room.gameplay_persist_mode, "manifest_ram");
    assert.equal(result.snapshot.room.status, "finished");
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
