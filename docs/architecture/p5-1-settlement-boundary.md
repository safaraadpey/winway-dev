# P5.1 — Settlement Boundary

> READ ONLY · Conceptual · Companion to [p5-1-platform-session-model.md](./p5-1-platform-session-model.md)

Financial correctness stays on Platform. Engines compute **who should be paid what and why (rules)**; Platform decides **whether money moves and records it**.

---

## 1. One sentence

**Engine proposes settlement lines; Platform validates, applies ledger, and marks `session_settlement`.**

---

## 2. Belongs to Platform

| Item | Why |
|------|-----|
| Wallet balances | Source of truth |
| Ledger / `transactions` | Append-only audit |
| Hold / release / capture semantics | Prevent double spend |
| Commission rates & affiliation payouts | Platform economy |
| Ding (or secondary currency) **ledger** | Platform economy |
| `session_settlement` header + applied lines | Durable money outcome |
| Idempotency keys / settle status machine | Retry safety |
| Before/after balance records | Financial safety standard |
| Permission to mutate money | Only Platform RPCs |

Platform may reject a proposal that:

- Does not balance (in ≠ out + fees, per policy)
- References unknown participants
- Replays an already-applied key
- Arrives when session status ≠ **Finished** (or allowed cancel path)

---

## 3. Belongs to Engine

| Item | Why |
|------|-----|
| Winner detection | Game rules |
| Prize split rules (line/full, side pots, cube, etc.) | Game rules |
| Ordering of claims / ties / shared wins | Game rules |
| Narrative refs (`ticket_id`, `hand_id`, `spin_id`) | Engine audit / UI |
| Engine prize detail tables | Non-financial SoT |
| Declaring **Finished** | Play complete signal |
| Building the **settlement proposal** | Knows outcomes |

Engine **must not**:

- `UPDATE` wallets directly
- Invent a second ledger
- Treat realtime “win” events as payment authority
- Finalize money only in React / engine memory

---

## 4. Settlement proposal (conceptual contract)

```text
SettlementProposal {
  session_id
  settlement_key          -- idempotent
  game_code
  lines[] {
    user_id
    amount                -- signed or direction+amount
    reason_code           -- platform-enum: prize|refund|fee|commission|…
    engine_ref            -- opaque: ticket:… / move:… / pot:…
  }
  fees[] / commission_hints[]   -- optional; Platform may recompute commissions
  metadata                      -- non-authoritative
}
```

Platform:

1. Locks session / settlement row  
2. Validates status + participants + math policy  
3. Applies wallet deltas (existing idempotent finance pattern)  
4. Writes `session_settlement` = applied  
5. Sets session status **Settled**

---

## 5. Split of “why” vs “how much”

| Question | Owner |
|----------|-------|
| Did this player win a full house? | Bingo engine |
| Did this player win the match? | Backgammon engine |
| How much credit hits wallet? | **Platform** after accepting proposal (or Platform-computed fee) |
| What commission % applies? | Platform (may snapshot at join) |
| How to show trophy UI? | Engine + client |

---

## 6. Multi-phase settle (optional)

Some games need interim money (Poker side pots, Roulette mid-table). Prefer:

- Multiple `settlement_key`s per session (`spin:17`, `hand:4`), **or**
- Child sub-sessions  

Default for Bingo-like rooms: **one** settlement when **Finished**.

---

## 7. Holds vs prizes

| Phase | Platform |
|-------|----------|
| Join | Hold entry fee (participant hold_ref) |
| Cancel before Running | Release holds |
| Finished → Settled | Capture holds + pay prize lines (policy-specific) |

Engine does not release holds itself; it requests cancel/settle.

---

## 8. Commissions

| Layer | Role |
|-------|------|
| Platform | Rates, affiliation graph, `commissions_log`, payout |
| Engine | May attach `engine_ref` (e.g. legacy ticket id) for traceability |

Future: generalize today’s ticket-keyed commission to `source_type + source_id` without requiring Bingo tickets for Backgammon.

---

## 9. Ding / secondary rewards

| Layer | Role |
|-------|------|
| Platform | `ding_balances` / ding ledger |
| Engine | May emit **reward intents** (e.g. per Bingo number drawn) as non-wallet lines or separate reward proposals |

Do not bury Bingo-only ding triggers inside Platform session tables; keep triggers in Bingo domain calling Platform ding APIs.

---

## 10. Failure & rollback (design)

| Failure | Behavior |
|---------|----------|
| Proposal invalid | Reject; session stays **Finished**; engine may retry corrected proposal |
| Ledger apply fails mid-way | Transaction abort; settlement stays pending; retry same key |
| Double submit | Second call no-ops on unique key |
| Need compensating payment | New settlement_key + audit; never silent rewrite |

Physical rollback of applied ledger rows is **out of band** (compensating transactions only).

---

## 11. Relation to today’s Bingo settle (informational)

Today `fn_finish_room_and_settle` is **MIXED** (P5.0 Category C): prize rules + ledger in one RPC.

Target:

```text
bingo.compute_prize_lines(session)
  → platform.apply_session_settlement(proposal)
```

No implementation in P5.1.

---

## 12. Non-goals

- SQL for settlement tables  
- Changing current finance RPCs  
- Defining every `reason_code` enum value  
