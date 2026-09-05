/**
 * Run: node --import tsx --test lib/draw-order.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeDrawLists,
  mergeDrawListsForLiveRoom,
  orderDrawsForLiveRoom,
  sortDraws,
  type ProcessedDraw,
} from "./draw-order.js";

const NOW = "2026-09-05T12:00:00.000Z";

function ramDraw(seq: number, number: number): ProcessedDraw {
  return {
    id: `ram-room-${seq}`,
    number,
    created_at: NOW,
    processed_at: NOW,
  };
}

describe("orderDrawsForLiveRoom engine_ram", () => {
  it("preserves API array order for ram ids 1..11 (not lexicographic sort)", () => {
    const draws = Array.from({ length: 11 }, (_, i) => ramDraw(i + 1, i + 1));
    const ordered = orderDrawsForLiveRoom(draws, "engine_ram");
    assert.deepEqual(
      ordered.map((d) => d.number),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    );
  });

  it("sortDraws lexicographically corrupts ram ids after 9 (regression baseline)", () => {
    const draws = Array.from({ length: 11 }, (_, i) => ramDraw(i + 1, i + 1));
    const corrupted = sortDraws(draws).map((d) => d.number);
    assert.notDeepEqual(corrupted, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.equal(corrupted[1], 10);
    assert.equal(corrupted[2], 11);
  });

  it("per_draw PG path still uses timestamp sort", () => {
    const draws: ProcessedDraw[] = [
      {
        id: "b",
        number: 20,
        created_at: "2026-09-05T12:00:02.000Z",
        processed_at: "2026-09-05T12:00:02.000Z",
      },
      {
        id: "a",
        number: 10,
        created_at: "2026-09-05T12:00:01.000Z",
        processed_at: "2026-09-05T12:00:01.000Z",
      },
    ];
    assert.deepEqual(
      orderDrawsForLiveRoom(draws, "pg").map((d) => d.number),
      [10, 20]
    );
  });
});

describe("mergeDrawListsForLiveRoom", () => {
  it("engine_ram uses incoming server list as authoritative", () => {
    const existing = [ramDraw(1, 1), ramDraw(2, 2)];
    const incoming = Array.from({ length: 5 }, (_, i) => ramDraw(i + 1, i + 1));
    const merged = mergeDrawListsForLiveRoom(existing, incoming, "engine_ram");
    assert.equal(merged.length, 5);
    assert.deepEqual(merged.map((d) => d.number), [1, 2, 3, 4, 5]);
  });

  it("per_draw merge still dedupes and sorts by processed_at", () => {
    const merged = mergeDrawLists(
      [
        {
          id: "d2",
          number: 2,
          created_at: "2026-09-05T12:00:02.000Z",
          processed_at: "2026-09-05T12:00:02.000Z",
        },
      ],
      [
        {
          id: "d1",
          number: 1,
          created_at: "2026-09-05T12:00:01.000Z",
          processed_at: "2026-09-05T12:00:01.000Z",
        },
      ]
    );
    assert.deepEqual(merged.map((d) => d.number), [1, 2]);
  });
});
