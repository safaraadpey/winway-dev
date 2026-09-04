/**
 * Run: node --import tsx --test lib/hooks/useBalancesLiveDing.test.ts
 *
 * Pure contract tests mirroring useBalances live Ding behavior (no React).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPerDrawRevealCredit,
  canApplyLiveDingRevealCredit,
  type DingSettleMode,
} from "@/lib/liveRoom/liveDingUi";
import type { LiveRoomSnapshot } from "@/services/rooms";

function snapshot(
  dingSettleMode: DingSettleMode,
  dingPerNumber = 2
): LiveRoomSnapshot {
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
      ding_per_number: dingPerNumber,
      ding_settle_mode: dingSettleMode,
    },
    draws: [],
    cards: [
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
  };
}

/** Mirrors creditDingOnReveal guard + balance update (timeouts/animation omitted). */
function simulateCreditDingOnReveal(
  mode: DingSettleMode,
  initialBalance: number,
  credits: Array<{ revealKey: string; delta: number } | null>
) {
  let balance = initialBalance;
  let callCount = 0;
  const creditedKeys = new Set<string>();

  for (const credit of credits) {
    if (!credit) continue;
    if (!canApplyLiveDingRevealCredit(mode)) continue;
    const { revealKey, delta } = credit;
    if (!revealKey || delta <= 0) continue;
    if (creditedKeys.has(revealKey)) continue;
    creditedKeys.add(revealKey);
    balance += delta;
    callCount += 1;
  }

  return { balance, callCount };
}

function simulateApplySettledDingBalance(ledgerBalance: number) {
  return Number(ledgerBalance) || 0;
}

describe("useBalances room_level live Ding contract", () => {
  it("room_level + 10 reveals keeps header balance unchanged", () => {
    const snap = snapshot("room_level");
    const initialBalance = 500;
    const credits = Array.from({ length: 10 }, (_, i) =>
      buildPerDrawRevealCredit(snap, i + 1)
    );
    const { balance, callCount } = simulateCreditDingOnReveal(
      "room_level",
      initialBalance,
      credits
    );
    assert.equal(balance, initialBalance);
    assert.equal(callCount, 0);
  });

  it("room_level creditDingOnReveal call count is zero", () => {
    assert.equal(canApplyLiveDingRevealCredit("room_level"), false);
    const { callCount } = simulateCreditDingOnReveal("room_level", 100, [
      { revealKey: "room-1:7", delta: 4 },
      { revealKey: "room-1:8", delta: 2 },
    ]);
    assert.equal(callCount, 0);
  });

  it("room_level has no pending overlay — only settled ledger applies", () => {
    const headerBefore = 500;
    const afterReveals = simulateCreditDingOnReveal("room_level", headerBefore, [
      { revealKey: "room-1:1", delta: 10 },
    ]);
    assert.equal(afterReveals.balance, headerBefore);

    const ledgerBalance = 520;
    const headerAfterSettlement = simulateApplySettledDingBalance(ledgerBalance);
    assert.equal(headerAfterSettlement, ledgerBalance);
  });

  it("after settlement header equals ding_balances ledger amount", () => {
    const ledgerAmount = 1842;
    assert.equal(simulateApplySettledDingBalance(ledgerAmount), ledgerAmount);
  });
});

describe("useBalances per_draw legacy contract", () => {
  it("per_draw reveal still increments balance on matched numbers", () => {
    const snap = snapshot("per_draw", 3);
    const credit = buildPerDrawRevealCredit(snap, 7);
    assert.ok(credit);
    const { balance, callCount } = simulateCreditDingOnReveal("per_draw", 100, [
      credit,
    ]);
    assert.equal(callCount, 1);
    assert.equal(balance, 103);
  });
});
