# P5.3 — Bingo ↔ Platform Session Adapter

> **Phase:** P5.3 — READ ONLY  
> **Date:** 2026-08-03  
> **Authority:** Design only — no SQL, migrations, dual-write, backfill, or code  
> **Builds on:** P5.1 session model · P5.2 foundation · live Bingo `rooms` lifecycle

Companions:

- [p5-3-session-mapping.md](./p5-3-session-mapping.md) — identity & field map  
- [p5-3-sync-lifecycle.md](./p5-3-sync-lifecycle.md) — transitions, direction, ownership  
- [p5-3-backfill-strategy.md](./p5-3-backfill-strategy.md) — historical rooms → sessions  

---

## 1. Purpose

Bingo still runs 100% on the legacy model (`public.rooms`, tickets, draws, settle RPCs).

Platform Session tables exist (`platform.game_sessions`, …) but are **not** wired.

This phase designs the **adapter**: how every Bingo room corresponds to exactly one Platform session, how lifecycle syncs, and how failures/retries/backfill work — **without changing live traffic yet**.

---

## 2. Adapter role (canonical)

```text
┌─────────────────────────────────────┐
│ Bingo Engine + legacy SQL           │  SOURCE OF TRUTH for play
│ rooms / tickets / draws / settle    │  SOURCE OF TRUTH for Bingo money path (today)
└─────────────────┬───────────────────┘
                  │  Adapter (future)
                  │  one-way mirror (phase 1)
                  ▼
┌─────────────────────────────────────┐
│ Platform Session shell              │  PROJECTED lifecycle + identity
│ game_sessions / participants / …    │  NOT authoritative for Bingo play
└─────────────────────────────────────┘
```

| Phase (future) | Adapter behavior |
|----------------|------------------|
| **P5.3 (now)** | Design only |
| **Mirror** | Bingo → Platform projections; Bingo never waits on Platform |
| **Cutover (much later)** | Platform may become shell SoT; Bingo attaches domain state |

Until cutover: **Bingo owns play and money path; Platform is a projection.**

---

## 3. One room ↔ one session

Invariant:

> Every Bingo room that participates in the adapter maps to **exactly one** `platform.game_sessions` row.

- No session without a room during Bingo-legacy era (except Platform-only games like future Backgammon).
- No two sessions for the same room.
- Cards, draws, marks, winners stay **Bingo-only** — never copied into Platform columns.

Identity: **same UUID** — see [p5-3-session-mapping.md](./p5-3-session-mapping.md).

---

## 4. Lifecycle diagram (adapter view)

```text
Bingo (legacy)                         Platform (projected)
─────────────────                      ────────────────────
Room Created        ──mirror──►        Session Created
Waiting             ──mirror──►        Waiting
Claimed (lease)     ──mirror──►        Claimed
Running (playing)   ──mirror──►        Running
Finished*           ──mirror──►        Finished
Settled*            ──mirror──►        Settled
Archived / cold     ──mirror──►        Archived

* Bingo may use intermediate `settling` before `finished`;
  Platform Finished ≈ play complete / settle eligible;
  Platform Settled  ≈ money applied (Bingo finished after settle).
```

Detailed status aliases and ownership: [p5-3-sync-lifecycle.md](./p5-3-sync-lifecycle.md).

---

## 5. Ownership summary

| Concern | Owner today + mirror phase |
|---------|----------------------------|
| Room create / waiting / playing | **Bingo** |
| Engine lease claim/release | **Bingo** (engine) |
| Draws, marks, evaluate | **Bingo** |
| Wallet holds / settle RPC | **Bingo / existing finance** (unchanged) |
| Platform session row + status mirror | **Adapter** (writes Platform only) |
| Platform as money SoT | **Neither** until settlement cutover (out of P5.3) |

---

## 6. Synchronization points (summary)

| Point | Direction | Mode |
|-------|-----------|------|
| Room creation | Bingo → Platform | One-way |
| Waiting open | Bingo → Platform | One-way |
| Room claim / lease | Bingo → Platform | One-way |
| Game start (playing) | Bingo → Platform | One-way |
| Game finish / settling | Bingo → Platform | One-way |
| Settlement complete | Bingo → Platform | One-way |
| Archive / retention | Bingo → Platform (or Platform janitor reading Bingo) | One-way |

**No Platform → Bingo** control plane in the mirror phase.  
Platform must not create, claim, or settle Bingo rooms.

Full matrix: [p5-3-sync-lifecycle.md](./p5-3-sync-lifecycle.md).

---

## 7. Failure policy (summary)

If Platform update fails during mirror:

| Default | Behavior |
|---------|----------|
| Should Bingo stop? | **No** |
| Should it retry? | **Yes** (async / outbox) |
| Should it queue? | **Yes** |
| Should it ignore? | **No** (except poison after DLQ policy) |

Money and play never depend on Platform projection health.

Detail: [p5-3-sync-lifecycle.md](./p5-3-sync-lifecycle.md) § Failure.

---

## 8. Idempotency (summary)

Every mirror op keyed by `room_id` (= `session_id`) + transition version / target status.

| Duplicate | Result |
|-----------|--------|
| create | No-op if session exists |
| finish | No-op if already finished/settled/archived |
| settle | No-op if settlement_key applied / status settled |
| archive | No-op if already archived |

Detail: [p5-3-session-mapping.md](./p5-3-session-mapping.md) § Idempotency.

---

## 9. Compatibility (verified by design)

| Requirement | Status |
|-------------|--------|
| Current Bingo behavior identical | **Yes** — adapter not enabled |
| No application changes required (this phase) | **Yes** |
| No API changes | **Yes** |
| No settlement changes | **Yes** |
| P5.2 dummy session unrelated to rooms | **Yes** |

---

## 10. Future migration plan (high level)

1. **P5.3** — This design  
2. **Outbox table + worker** (later) — Bingo commits, enqueue mirror, async apply to Platform  
3. **Backfill** — historical rooms → sessions offline ([backfill doc](./p5-3-backfill-strategy.md))  
4. **Observe drift** — compare room status vs session status  
5. **Optional participant mirror** — tickets → session_participants (still one-way)  
6. **Do not** reverse control or replace settle until a dedicated finance cutover phase  

---

## 11. Non-goals

- Enabling dual-write  
- SQL / migrations  
- Changing engine or app  
- Connecting rooms to game_sessions in production  

---

## Related

- [p5-1-platform-session-model.md](./p5-1-platform-session-model.md)  
- [p5-1-settlement-boundary.md](./p5-1-settlement-boundary.md)  
- [p5-2-platform-foundation.md](./p5-2-platform-foundation.md)  
