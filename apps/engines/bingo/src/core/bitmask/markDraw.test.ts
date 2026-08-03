import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRegistryFromCardNumbers } from "../card-registry/build.js";
import { applyMarkForDrawBitmask } from "./markDraw.js";
import { buildRoomAssignmentIndex } from "../../runtime/room-assignments.js";
import type { TicketRow } from "../../repositories/types.js";

describe("applyMarkForDrawBitmask", () => {
  const registry = buildRegistryFromCardNumbers([
    { pool_card_id: "c1", value: 7, row_no: 1, col_no: 1 },
    { pool_card_id: "c1", value: 14, row_no: 1, col_no: 3 },
    { pool_card_id: "c1", value: 21, row_no: 2, col_no: 2 },
    { pool_card_id: "c2", value: 7, row_no: 1, col_no: 1 },
    { pool_card_id: "c2", value: 22, row_no: 2, col_no: 2 },
  ]);

  const tickets: TicketRow[] = [
    {
      id: "t1",
      room_id: "r1",
      player_user_id: "u1",
      pool_card_id: "c1",
      price: 100,
      reservation_status: "consumed",
      cancelled_at: null,
    },
    {
      id: "t2",
      room_id: "r1",
      player_user_id: "u2",
      pool_card_id: "c2",
      price: 100,
      reservation_status: "consumed",
      cancelled_at: null,
    },
  ];

  const assignments = buildRoomAssignmentIndex(tickets);

  it("marks only affected assignments via reverse index", () => {
    const maskByTicket = new Map<string, number>();
    const result = applyMarkForDrawBitmask({
      drawNumber: 7,
      numberIndex: registry.numberIndex,
      assignmentsByCardId: assignments.assignmentsByCardId,
      maskByTicket,
    });

    assert.equal(result.markRows.length, 2);
    assert.deepEqual(new Set(result.affectedTicketIds), new Set(["t1", "t2"]));
    assert.ok((maskByTicket.get("t1") ?? 0) > 0);
    assert.ok((maskByTicket.get("t2") ?? 0) > 0);
  });

  it("returns no marks for number not on any assigned card", () => {
    const maskByTicket = new Map<string, number>();
    const result = applyMarkForDrawBitmask({
      drawNumber: 99,
      numberIndex: registry.numberIndex,
      assignmentsByCardId: assignments.assignmentsByCardId,
      maskByTicket,
    });
    assert.equal(result.markRows.length, 0);
    assert.equal(result.affectedTicketIds.length, 0);
  });
});
