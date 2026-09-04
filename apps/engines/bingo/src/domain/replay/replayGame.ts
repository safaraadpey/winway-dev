/**
 * Authoritative Engine replay — RAM only, no I/O.
 * Reuses pickNextNumber + evaluateDrawInRam + Ding + prizeSplit.
 */

import { createHash } from "node:crypto";
import { buildRegistryFromCardNumbers, type RawCardNumber } from "../../core/card-registry/build.js";
import { pickNextNumber } from "../../core/rng.js";
import { resolveRewardPercentages, splitPrizePool } from "../../core/prizeSplit.js";
import { accumulateDrawDingCredits } from "../ding/roomDingState.js";
import { prepareDingCreditsFromState } from "../ding/index.js";
import { evaluateDrawInRam } from "../room-loop/evaluateDrawInRam.js";
import { RoomRuntimeState } from "../../state/room-state.js";
import type { RoomRow, TicketRow } from "../../repositories/types.js";
import { assertManifestSeed } from "./parseManifest.js";
import type {
  GameManifest,
  GameReplayMark,
  GameReplayResult,
  GameReplayWinner,
} from "./types.js";
import { RNG_ALGORITHM, RNG_VERSION } from "./types.js";

function fingerprintCells(rows: readonly RawCardNumber[]): string {
  const parts = [...rows]
    .sort(
      (a, b) =>
        a.row_no - b.row_no || a.col_no - b.col_no || a.value - b.value
    )
    .map((r) => `${r.row_no}:${r.col_no}:${r.value}`);
  return createHash("sha256").update(parts.join(",")).digest("hex");
}

function sortWinners(rows: GameReplayWinner[]): GameReplayWinner[] {
  return [...rows].sort((a, b) => a.ticketId.localeCompare(b.ticketId));
}

function sortMarks(rows: GameReplayMark[]): GameReplayMark[] {
  return [...rows].sort((a, b) => {
    const t = a.ticketId.localeCompare(b.ticketId);
    return t !== 0 ? t : a.value - b.value;
  });
}

export function replayGame(args: {
  manifest: GameManifest;
  cardNumbers: readonly RawCardNumber[];
}): GameReplayResult {
  const { manifest } = args;
  const seed = assertManifestSeed(manifest);
  if (manifest.tickets.length < 1) {
    throw new Error("replayGame: empty ticket roster");
  }

  const cellsByCard = new Map<string, RawCardNumber[]>();
  for (const row of args.cardNumbers) {
    const id = String(row.pool_card_id);
    if (!cellsByCard.has(id)) cellsByCard.set(id, []);
    cellsByCard.get(id)!.push(row);
  }

  for (const ticket of manifest.tickets) {
    const cells = cellsByCard.get(ticket.poolCardId) ?? [];
    if (cells.length === 0) {
      throw new Error(`replayGame: no card_numbers for ${ticket.poolCardId}`);
    }
    if (ticket.gridFingerprint) {
      const fp = fingerprintCells(cells);
      if (fp !== ticket.gridFingerprint) {
        throw new Error(`replayGame: grid_fingerprint mismatch ticket ${ticket.ticketId}`);
      }
    }
  }

  const registry = buildRegistryFromCardNumbers(args.cardNumbers);
  const room: RoomRow = {
    id: manifest.roomId,
    status: "playing",
    currency: manifest.currency,
    room_seed: `\\x${manifest.roomSeedHex}`,
    room_template_id: null,
    next_draw_at: null,
    starts_at: null,
    waiting_started_at: null,
    min_players: 1,
    max_players: null,
    countdown_sec: 120,
    first_line_draw_number: null,
    line_reward_percentage: manifest.lineRewardPercentage,
    full_reward_percentage: manifest.fullRewardPercentage,
    ding_per_number: manifest.dingPerNumber,
    ding_settle_mode: manifest.dingSettleMode,
    meta: null,
  };

  const tickets: TicketRow[] = manifest.tickets.map((t) => ({
    id: t.ticketId,
    room_id: manifest.roomId,
    player_user_id: t.userId,
    pool_card_id: t.poolCardId,
    price: t.price,
    reservation_status: "reserved",
    cancelled_at: null,
  }));

  const state = new RoomRuntimeState({
    room,
    tickets,
    markedByTicket: new Map(),
    existingLineTickets: new Set(),
    existingFullTickets: new Set(),
    drawnNumbers: [],
    unprocessedDrawNumbers: new Set(),
    templateDingPerNumber: manifest.dingPerNumber,
  });

  const drawSequence: number[] = [];
  const marks: GameReplayMark[] = [];
  const lineWinners: GameReplayWinner[] = [];
  const fullWinners: GameReplayWinner[] = [];
  const dingPending = new Map<string, number>();

  for (let i = 0; i < 90; i++) {
    const next = pickNextNumber(seed, drawSequence);
    if (next == null) break;

    const evalResult = evaluateDrawInRam(state, next, registry);
    const ding = prepareDingCreditsFromState(state, next, evalResult.persistence.marks);
    accumulateDrawDingCredits(dingPending, ding.credits);
    state.recordDrawInserted(next);
    drawSequence.push(next);

    for (const m of evalResult.persistence.marks) {
      marks.push({ ticketId: m.ticket_id, value: m.value });
    }
    for (const r of evalResult.persistence.results) {
      const row: GameReplayWinner = {
        ticketId: r.ticket_id,
        userId: r.user_id,
        drawNumber: r.draw_number,
      };
      if (r.win_type === "line") lineWinners.push(row);
      else fullWinners.push(row);
    }

    if (evalResult.fullWinnerThisDraw) {
      break;
    }
  }

  const pct = resolveRewardPercentages(
    manifest.lineRewardPercentage,
    manifest.fullRewardPercentage,
    null,
    null
  );
  const prize = splitPrizePool({
    totalPool: manifest.commissionPool,
    linePct: pct.linePct,
    fullPct: pct.fullPct,
    lineWinners: lineWinners.length,
    fullWinners: fullWinners.length,
  });

  const dingByUser = [...dingPending.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => a.userId.localeCompare(b.userId));

  const stoppedReason = fullWinners.length > 0 ? "full_house" : "exhausted";

  return {
    manifestVersion: manifest.manifestVersion,
    rngAlgorithm: RNG_ALGORITHM,
    rngVersion: RNG_VERSION,
    drawSequence,
    firstLineDrawNumber: state.room.first_line_draw_number,
    lineWinners: sortWinners(lineWinners),
    fullWinners: sortWinners(fullWinners),
    marks: sortMarks(marks),
    dingByUser,
    prizePreview: {
      totalPool: manifest.commissionPool,
      linePool: prize.linePool,
      fullPool: prize.fullPool,
      lineShare: prize.lineShare,
      fullShare: prize.fullShare,
      lineWinners: lineWinners.length,
      fullWinners: fullWinners.length,
    },
    stoppedReason,
  };
}
