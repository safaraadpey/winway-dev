/**
 * Run: node --import tsx --test lib/liveRoom/deriveLiveWinners.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LiveRoomSnapshot } from "@/services/rooms";
import {
  canOpenLiveResultsDialog,
  deriveFirstFullWinners,
  deriveFirstLineWinners,
  resolveDisplayLineWinners,
  revealCountThroughFirstFullWin,
  shouldPollDrawsAfterStatus,
  shouldRevealNextLiveDraw,
} from "./deriveLiveWinners.js";

function card(
  ticketId: string,
  playerId: string,
  rows: (number | null)[][]
): LiveRoomSnapshot["cards"][number] {
  return {
    ticket_id: ticketId,
    player_id: playerId,
    player_name: ticketId,
    card_number: 1,
    is_my_card: true,
    card: rows,
  };
}

const LINE_CARD = card("t-line", "u1", [
  [1, 2, 3, 4, 5, null, null, null, null],
  [11, 12, 13, 14, 15, null, null, null, null],
  [21, 22, 23, 24, 25, null, null, null, null],
]);

describe("deriveFirstLineWinners", () => {
  it("finds the first completed line when joining mid-game", () => {
    const called = [90, 1, 2, 3, 4, 5, 70, 19];
    const winners = deriveFirstLineWinners([LINE_CARD], called);
    assert.deepEqual(winners, [
      { ticketId: "t-line", userId: "u1", drawNumber: 5 },
    ]);
  });

  it("returns empty before any line is complete", () => {
    assert.deepEqual(deriveFirstLineWinners([LINE_CARD], [1, 2, 3, 4]), []);
  });

  it("returns all cards that complete on the same first winning ball", () => {
    const other = card("t-2", "u2", [
      [5, 6, 7, 8, 9, null, null, null, null],
      [11, 12, 13, 14, 15, null, null, null, null],
      [21, 22, 23, 24, 25, null, null, null, null],
    ]);
    const winners = deriveFirstLineWinners([LINE_CARD, other], [1, 2, 3, 4, 5]);
    assert.deepEqual(
      winners.map((w) => w.ticketId),
      ["t-line"]
    );
  });
});

describe("deriveFirstFullWinners", () => {
  it("stops at the first ball that completes a card, even if that ball is 1", () => {
    const fullCard = card("t-full", "u1", [
      [1, 2, 3, 4, 5, null, null, null, null],
      [11, 12, 13, 14, 15, null, null, null, null],
      [21, 22, 23, 24, 25, null, null, null, null],
    ]);
    const called = [11, 12, 13, 14, 15, 21, 22, 23, 24, 25, 2, 3, 4, 5, 90, 1, 70];
    const winners = deriveFirstFullWinners([fullCard], called);
    assert.deepEqual(winners, [
      { ticketId: "t-full", userId: "u1", drawNumber: 1 },
    ]);
    assert.equal(revealCountThroughFirstFullWin([fullCard], called), 16);
    assert.equal(
      shouldRevealNextLiveDraw([fullCard], called.slice(0, 16)),
      false
    );
    assert.equal(
      shouldRevealNextLiveDraw([fullCard], called.slice(0, 15)),
      true
    );
    assert.equal(
      canOpenLiveResultsDialog([], "finished"),
      false
    );
    assert.equal(
      canOpenLiveResultsDialog(
        [{ ticketId: "t-full", userId: "u1", drawNumber: 1 }],
        "playing"
      ),
      true
    );
  });
});

describe("shouldPollDrawsAfterStatus", () => {
  it("keeps polling through settling and finished until UI caught the last ball", () => {
    assert.equal(shouldPollDrawsAfterStatus("playing", false), true);
    assert.equal(shouldPollDrawsAfterStatus("settling", false), true);
    assert.equal(shouldPollDrawsAfterStatus("finished", true), true);
    assert.equal(shouldPollDrawsAfterStatus("finished", false), false);
  });
});

describe("resolveDisplayLineWinners", () => {
  const room = {
    id: "r1",
    status: "playing",
    room_code: "1",
    card_price: 1,
    currency: "IRR",
    min_players: 1,
    max_cards_per_player: 4,
    started_at: null,
    line_reward_percentage: 0.5,
    full_reward_percentage: 0.5,
    commission_rate: 0,
    gameplay_persist_mode: "manifest_ram" as const,
  };

  it("derives line when engine snapshot omitted winners (mid-game join)", () => {
    const snapshot: LiveRoomSnapshot = {
      source: "engine_ram",
      room,
      draws: [],
      cards: [LINE_CARD],
    };
    const winners = resolveDisplayLineWinners({
      snapshot,
      calledInOrder: [1, 2, 3, 4, 5, 70],
      dbLineWinners: [],
    });
    assert.equal(winners[0]?.ticketId, "t-line");
    assert.equal(winners[0]?.drawNumber, 5);
  });

  it("uses visible cards over RAM when a line is already complete", () => {
    const snapshot: LiveRoomSnapshot = {
      source: "engine_ram",
      room,
      draws: [],
      cards: [LINE_CARD],
      line_winners: [{ ticketId: "t-engine", userId: "u9", drawNumber: 5 }],
    };
    const winners = resolveDisplayLineWinners({
      snapshot,
      calledInOrder: [1, 2, 3, 4, 5],
      dbLineWinners: [],
    });
    assert.equal(winners[0]?.ticketId, "t-line");
    assert.equal(winners[0]?.drawNumber, 5);
  });
});
