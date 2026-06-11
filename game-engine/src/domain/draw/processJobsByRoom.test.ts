import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupJobsByRoom } from "./processJobsByRoom.js";
import type { DrawJob } from "./types.js";

function job(
  id: number,
  roomId: string,
  drawNumber: number,
  createdAt: string
): DrawJob {
  return {
    id,
    room_id: roomId,
    draw_number: drawNumber,
    status: "processing",
    attempts: 0,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

describe("groupJobsByRoom", () => {
  it("orders jobs by draw_number within a room (created_at tiebreaker)", () => {
    const room = "room-a";
    const grouped = groupJobsByRoom([
      job(2, room, 55, "2026-06-10T14:29:10.672Z"),
      job(1, room, 8, "2026-06-10T14:29:11.000Z"),
    ]);

    const list = grouped.get(room);
    assert.ok(list);
    assert.deepEqual(
      list.map((j) => j.draw_number),
      [8, 55]
    );
  });
});
