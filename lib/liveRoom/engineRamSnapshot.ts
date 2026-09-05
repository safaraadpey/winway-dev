import type { LiveRoomSnapshot } from "@/services/rooms";
import {
  mergeDrawListsForLiveRoom,
  type ProcessedDraw,
} from "@/lib/draw-order";

export function isEngineRamSnapshot(
  snapshot: Pick<LiveRoomSnapshot, "source"> | null | undefined
): boolean {
  return snapshot?.source === "engine_ram";
}

/** manifest_ram rooms still in play must not use PG/Vercel draws as live truth. */
export function isManifestRamEngineOnlyPhase(
  snapshot: Pick<LiveRoomSnapshot, "room" | "source"> | null | undefined
): boolean {
  if (!snapshot) return false;
  if (isEngineRamSnapshot(snapshot)) return true;
  if (snapshot.room.gameplay_persist_mode !== "manifest_ram") return false;
  const status = (snapshot.room.status || "").trim().toLowerCase();
  return status !== "finished" && status !== "cancelled";
}

export function resolveDrawSource(
  snapshot: Pick<LiveRoomSnapshot, "source" | "room"> | null | undefined
): "engine_ram" | "pg" | undefined {
  if (!snapshot) return undefined;
  if (snapshot.source === "engine_ram") return "engine_ram";
  // manifest_ram must never use PG timestamp/id sort — preserve API array order.
  if (snapshot.room.gameplay_persist_mode === "manifest_ram") return "engine_ram";
  return "pg";
}

export function shouldAcceptEngineRamEventSeq(
  lastAccepted: number | null | undefined,
  incoming: number | undefined,
  snapshot: Pick<LiveRoomSnapshot, "source">
): boolean {
  if (!isEngineRamSnapshot(snapshot)) return true;
  if (incoming == null || !Number.isFinite(incoming)) return true;
  if (lastAccepted == null || lastAccepted === undefined) return true;
  return incoming >= lastAccepted;
}

export function preserveLiveRoomCards(
  prevCards: LiveRoomSnapshot["cards"] | undefined,
  incomingCards: LiveRoomSnapshot["cards"] | undefined,
  snapshot: Pick<LiveRoomSnapshot, "source" | "room">
): LiveRoomSnapshot["cards"] {
  const manifestRam =
    isEngineRamSnapshot(snapshot) ||
    snapshot.room.gameplay_persist_mode === "manifest_ram";

  if (!manifestRam) {
    return incomingCards ?? prevCards ?? [];
  }

  if (incomingCards && incomingCards.length > 0) {
    return incomingCards;
  }
  if (prevCards && prevCards.length > 0) {
    return prevCards;
  }
  return incomingCards ?? [];
}

/** Draws-only polls omit stable room metadata — keep prior financial/display fields. */
export function mergeLiveRoomRoomFields(
  prev: LiveRoomSnapshot["room"] | undefined,
  incoming: LiveRoomSnapshot["room"]
): LiveRoomSnapshot["room"] {
  if (!prev) return incoming;

  const pick = <K extends keyof LiveRoomSnapshot["room"]>(key: K) => {
    const value = incoming[key];
    return value !== undefined && value !== null ? value : prev[key];
  };

  return {
    ...prev,
    ...incoming,
    room_code: pick("room_code"),
    room_name: pick("room_name"),
    room_seed_hash: pick("room_seed_hash"),
    card_price: pick("card_price"),
    currency: pick("currency"),
    min_players: pick("min_players"),
    max_cards_per_player: pick("max_cards_per_player"),
    started_at: pick("started_at"),
    line_reward_percentage: pick("line_reward_percentage"),
    full_reward_percentage: pick("full_reward_percentage"),
    commission_rate: pick("commission_rate"),
    ding_per_number: pick("ding_per_number"),
    ding_settle_mode: pick("ding_settle_mode"),
    gameplay_persist_mode: pick("gameplay_persist_mode"),
  };
}

export type ApplySnapshotResult =
  | { accepted: true; snapshot: LiveRoomSnapshot }
  | { accepted: false; reason: "stale_event_seq" };

/** manifest_ram live play must not merge PG/realtime draw rows into UI state. */
export function shouldUsePgLiveDrawUpdates(
  snapshot: Pick<LiveRoomSnapshot, "source" | "room"> | null | undefined
): boolean {
  return resolveDrawSource(snapshot) !== "engine_ram";
}

/**
 * PG results are empty during manifest_ram play (writes-per-draw=0).
 * Sync from DB only after the room leaves the engine-only live phase.
 */
export function shouldSyncWinnersDisplayFromDb(
  snapshot: Pick<LiveRoomSnapshot, "source" | "room"> | null | undefined
): boolean {
  if (!snapshot) return false;
  const status = (snapshot.room.status || "").trim().toLowerCase();
  const terminal =
    status !== "" &&
    !["running", "playing", "live", "waiting"].includes(status);
  if (
    snapshot.source === "engine_ram" ||
    snapshot.room.gameplay_persist_mode === "manifest_ram"
  ) {
    return terminal;
  }
  return true;
}

export function mergeLiveRoomWinners<T>(
  prev: T[] | undefined,
  incoming: T[] | undefined
): T[] | undefined {
  return incoming !== undefined ? incoming : prev;
}

export function applyLiveRoomSnapshotUpdate(
  prev: LiveRoomSnapshot | null,
  incoming: LiveRoomSnapshot,
  opts?: { pendingDraws?: ProcessedDraw[] }
): ApplySnapshotResult {
  const roomForSource = mergeLiveRoomRoomFields(prev?.room, incoming.room);
  const drawSource =
    resolveDrawSource({
      source: incoming.source ?? prev?.source,
      room: roomForSource,
    }) ?? resolveDrawSource(prev ?? undefined);
  const pending =
    drawSource === "engine_ram" ? [] : (opts?.pendingDraws ?? []);

  if (
    prev &&
    isEngineRamSnapshot(incoming) &&
    !shouldAcceptEngineRamEventSeq(prev.eventSeq, incoming.eventSeq, incoming)
  ) {
    return { accepted: false, reason: "stale_event_seq" };
  }

  const pendingMerged = mergeDrawListsForLiveRoom([], pending, drawSource);
  const incomingDraws = mergeDrawListsForLiveRoom(
    [],
    mergeDrawListsForLiveRoom(incoming.draws, pendingMerged, drawSource),
    drawSource
  );

  const mergedDraws = prev
    ? mergeDrawListsForLiveRoom(prev.draws, incomingDraws, drawSource)
    : incomingDraws;

  const cards = preserveLiveRoomCards(prev?.cards, incoming.cards, {
    source: incoming.source ?? prev?.source,
    room: roomForSource,
  });
  const room = roomForSource;
  const line_winners = mergeLiveRoomWinners(
    prev?.line_winners,
    incoming.line_winners
  );
  const full_winners = mergeLiveRoomWinners(
    prev?.full_winners,
    incoming.full_winners
  );

  const tournament =
    incoming.tournament !== undefined && incoming.tournament !== null
      ? incoming.tournament
      : prev?.tournament ?? incoming.tournament ?? null;
  const is_tournament =
    incoming.is_tournament === true ||
    prev?.is_tournament === true ||
    Boolean(tournament?.id);

  const snapshot: LiveRoomSnapshot = {
    ...(prev ?? incoming),
    ...incoming,
    room,
    cards,
    tournament,
    is_tournament,
    line_winners,
    full_winners,
    draws: mergedDraws,
    eventSeq:
      incoming.eventSeq != null
        ? Math.max(prev?.eventSeq ?? 0, incoming.eventSeq)
        : prev?.eventSeq,
  };

  return { accepted: true, snapshot };
}

export function isEngineRamUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = error.message.toLowerCase();
  return (
    text.includes("engine_ram_unavailable") ||
    text.includes("live room state is on the game engine")
  );
}

export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Brief retries while engine RAM is still warming after room start. */
export async function retryWhileEngineRamUnavailable<T>(
  run: () => Promise<T>,
  opts?: { delaysMs?: number[] }
): Promise<T> {
  const delays = opts?.delaysMs ?? [120, 250, 400];
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isEngineRamUnavailableError(error) || attempt === delays.length) {
        throw error;
      }
      console.info("[LiveRoom] engine RAM unavailable, retry", {
        attempt: attempt + 1,
        delayMs: delays[attempt],
      });
      await waitMs(delays[attempt]);
    }
  }
  throw lastError;
}

/** engine_ram reveal cursor must never shrink on shorter draw lists. */
export function shouldRewindRevealCursor(
  authCount: number,
  revealedCount: number,
  source: LiveRoomSnapshot["source"] | undefined
): boolean {
  if (authCount >= revealedCount) return false;
  return source !== "engine_ram";
}
