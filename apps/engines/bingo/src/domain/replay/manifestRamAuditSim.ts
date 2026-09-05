/**
 * Audit-only: replay manifest draws through live RAM semantics (accumulateRoomDing).
 * Does not change gameplay — used only for manifest_ram shadow checksum parity.
 */
import { buildRegistryFromCardNumbers, type RawCardNumber } from "../../core/card-registry/build.js";
import { evaluateDrawInRam } from "../room-loop/evaluateDrawInRam.js";
import { prepareDingCreditsFromState } from "../ding/index.js";
import { RoomRuntimeState } from "../../state/room-state.js";
import type { RoomRow, TicketRow } from "../../repositories/types.js";
import { replayGame } from "./replayGame.js";
import {
  toFinalizationResultFromReplay,
  toFinalizationResultFromState,
} from "./toFinalizationResult.js";
import type { GameFinalizationResult, GameManifest, GameReplayResult } from "./types.js";
import { assertManifestSeed } from "./parseManifest.js";

function buildRoomRow(manifest: GameManifest, roomRow?: RoomRow | null): RoomRow {
  return {
    id: manifest.roomId,
    status: "playing",
    currency: manifest.currency,
    room_seed: `\\x${manifest.roomSeedHex}`,
    room_template_id: roomRow?.room_template_id ?? null,
    next_draw_at: null,
    starts_at: null,
    waiting_started_at: null,
    min_players: 1,
    max_players: null,
    countdown_sec: 120,
    first_line_draw_number: null,
    line_reward_percentage:
      roomRow != null
        ? roomRow.line_reward_percentage
        : manifest.lineRewardPercentage,
    full_reward_percentage:
      roomRow != null
        ? roomRow.full_reward_percentage
        : manifest.fullRewardPercentage,
    ding_per_number:
      roomRow != null ? roomRow.ding_per_number : manifest.dingPerNumber,
    ding_settle_mode: manifest.dingSettleMode,
    gameplay_persist_mode: "manifest_ram",
    meta: null,
  };
}

function buildTickets(manifest: GameManifest): TicketRow[] {
  return manifest.tickets.map((t) => ({
    id: t.ticketId,
    room_id: manifest.roomId,
    player_user_id: t.userId,
    pool_card_id: t.poolCardId,
    price: t.price,
    reservation_status: "reserved",
    cancelled_at: null,
  }));
}

/** Re-apply draw sequence through live RAM ding/mark path (matches runDrawCycle). */
export function simulateLiveRamStateFromDraws(
  manifest: GameManifest,
  cardNumbers: readonly RawCardNumber[],
  drawSequence: readonly number[],
  roomRow?: RoomRow | null
): RoomRuntimeState {
  assertManifestSeed(manifest);
  const registry = buildRegistryFromCardNumbers(cardNumbers);
  const state = new RoomRuntimeState({
    room: buildRoomRow(manifest, roomRow),
    tickets: buildTickets(manifest),
    markedByTicket: new Map(),
    existingLineTickets: new Set(),
    existingFullTickets: new Set(),
    drawnNumbers: [],
    unprocessedDrawNumbers: new Set(),
    templateDingPerNumber: manifest.dingPerNumber,
  });

  for (const drawNumber of drawSequence) {
    const evalResult = evaluateDrawInRam(state, drawNumber, registry);
    const ding = prepareDingCreditsFromState(
      state,
      drawNumber,
      evalResult.persistence.marks
    );
    state.accumulateRoomDing(ding.credits);
    state.recordDrawInserted(drawNumber);
    if (evalResult.fullWinnerThisDraw) {
      state.freezeAfterFullHouse();
      break;
    }
  }
  return state;
}

export function buildManifestRamAuditFinalization(
  manifest: GameManifest,
  cardNumbers: readonly RawCardNumber[],
  roomRow?: RoomRow | null
): { replay: GameReplayResult; finalization: GameFinalizationResult } {
  const replay = replayGame({ manifest, cardNumbers });
  const liveState = simulateLiveRamStateFromDraws(
    manifest,
    cardNumbers,
    replay.drawSequence,
    roomRow
  );
  const fromLive = toFinalizationResultFromState(
    liveState,
    manifest.commissionPool,
    manifest.manifestVersion
  );
  const fromReplay = toFinalizationResultFromReplay(
    manifest.roomId,
    manifest.manifestVersion,
    replay
  );
  return {
    replay,
    // Settlement stamps live RAM semantics; audit checksum uses the same path.
    finalization: fromLive.resultSha256 === fromReplay.resultSha256 ? fromReplay : fromLive,
  };
}
