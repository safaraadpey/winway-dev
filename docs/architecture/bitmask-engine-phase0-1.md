# Bitmask Engine — Phase 0 & 1 Architecture

> Status: **implemented (parallel engines)** — production default remains `MARKING_ENGINE=scan`.

## Goals

- 500 global card templates, reused across unlimited rooms
- O(affected_assignments) draw marking (not O(all_tickets))
- Bitwise line/full winner detection
- RAM authoritative; Redis replication; Postgres persistence
- `marks` table retained for audit

---

## 1. Database Schema (Phase 0)

Extends existing global card pool — **no duplication of `card_pool_cards`**.

| Table | Scope | Purpose |
|-------|-------|---------|
| `card_pool_cards` | Global | Unchanged — card definition source |
| `card_numbers` | Global | Unchanged + new `bit_position` column |
| `card_definition_masks` | Global | Precomputed `line1/2/3_mask`, `full_mask` per `pool_card_id` |
| `card_number_index` | Global | Reverse index: `value → (pool_card_id, bit_position)` |
| `tickets` | Per room | Assignments (unchanged) |
| `marks` | Per room | Audit trail (unchanged) |
| `results` | Per room | Winner events (unchanged) |

Migration: `sql/migrations/20260612120000_card_bitmask_phase0.sql`

Backfill: `SELECT * FROM fn_backfill_card_bitmask_definitions();`

### Bit layout (15 cells)

```
Row 1: bits 0–4   (cols sorted ascending within row)
Row 2: bits 5–9
Row 3: bits 10–14
```

---

## 2. TypeScript Modules

```
apps/engines/bingo/src/
  core/
    bitmask/           # mark, masks, winEvaluation, layout
    card-registry/     # global singleton, DB + fallback loader
  runtime/
    room-assignments.ts   # cardId → ticketIds per room
    marking-engine.ts     # feature-flag router (scan|bitmask|dual)
  benchmarks/
    marking-benchmark.ts  # scan vs bitmask comparison
```

### Key interfaces

- `GlobalCardRegistry` — `definitions`, `numberIndex`, `valueToBitByCard`
- `RoomAssignmentIndex` — `assignmentsByCardId`, `ticketCardId`, `ticketUserId`
- `RoomRuntimeState.maskByTicket` — per-room 15-bit state

---

## 3. Runtime Flow

```mermaid
sequenceDiagram
  participant DP as draw-processor
  participant REG as GlobalCardRegistry
  participant RS as RoomRuntimeState
  participant DB as Postgres

  DP->>REG: load once (startup)
  DP->>RS: ensureLoaded(room)
  Note over RS: assignmentsByCardId built from tickets

  alt MARKING_ENGINE=scan
    RS->>RS: applyMarkForDrawScan (all tickets)
    RS->>RS: evaluateDrawScan (cell iteration)
  else MARKING_ENGINE=bitmask
    RS->>REG: numberIndex[drawN]
    RS->>RS: assignmentsByCardId[cardId]
    RS->>RS: mask |= bit; bitwise win check
  else MARKING_ENGINE=dual
    RS->>RS: scan + bitmask compare
    Note over RS: scan authoritative
  end

  DP->>DB: marks + results (audit marks preserved)
```

---

## 4. Feature Flags

| Env | Values | Default |
|-----|--------|---------|
| `MARKING_ENGINE` | `scan`, `bitmask`, `dual` | `scan` |

- **scan** — legacy path, production default
- **bitmask** — new O(affected) path
- **dual** — both paths, logs discrepancies, scan wins

---

## 5. Redis Keys (replication — not authoritative)

Prefix: `ding:game-engine`

| Key | Type | Content |
|-----|------|---------|
| `room:{id}:meta` | HASH | status, first_line_draw_number |
| `room:{id}:masks` | HASH | ticketId → uint16 mask |
| `room:{id}:draws` | LIST | drawn numbers |
| `room:{id}:winners:line` | SET | line winner ticket ids |
| `room:{id}:winners:full` | SET | full winner ticket ids |
| `room:{id}:assignments` | STRING | JSON cardId→ticketIds |
| `cache:card-registry:version` | STRING | registry stamp |

Phase 1: keys defined; replication writer **not wired** (RAM remains authority).

---

## 6. Winner Detection (bitmask)

```typescript
(cardMask & line1Mask) === line1Mask  // or line2/line3
(cardMask & fullMask) === fullMask
```

Business rules preserved:
- Line wins only on `first_line_draw_number` draw
- Full wins always recorded
- Idempotency via `existingLineTickets` / `existingFullTickets`

---

## 7. Migration Plan (future phases — blocked on benchmarks)

| Phase | Status | Work |
|-------|--------|------|
| 0 | ✅ | Schema + backfill + TS bitmask core |
| 1 | ✅ | Parallel engines + assignment index + benchmarks |
| 2 | ✅ | Dual-mode shadow validation — see `bitmask-phase2-rollout.md` |
| 3 | ⏸ | Redis replication writer |
| 4 | ⏸ | Remove scan hot path |
| 5 | ⏸ | Optional `room_card_masks` persistence column |

**Gate:** Run `npm run benchmark:marking` and review speedup before Phase 2.

---

## 8. Performance Analysis

Run benchmark:

```bash
cd apps/engines/bingo
npm run benchmark:marking
```

Expected characteristics:

| Path | Per-draw complexity | Memory per room |
|------|---------------------|-----------------|
| Scan | O(tickets × 15) | cellsByCard copy in snapshot |
| Bitmask | O(cards_with_number × assignments_per_card) | uint16 per ticket |

With 500 cards and ~3 cards per number globally, typical draw touches ~3×(tickets/500) assignments — far fewer than full room scan at scale.

---

## 9. Folder Structure (target)

```
apps/engines/bingo/src/
  core/bitmask/
  core/card-registry/
  runtime/room-assignments.ts
  runtime/marking-engine.ts
  state/room-state.ts          # dual paths
  domain/draw/evaluateDraw.ts  # flag routing
  benchmarks/marking-benchmark.ts
sql/migrations/20260612120000_card_bitmask_phase0.sql
docs/architecture/bitmask-engine-phase0-1.md
```
