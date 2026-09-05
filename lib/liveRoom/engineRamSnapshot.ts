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

export type ApplySnapshotResult =
  | { accepted: true; snapshot: LiveRoomSnapshot }
  | { accepted: false; reason: "stale_event_seq" };

export function applyLiveRoomSnapshotUpdate(
  prev: LiveRoomSnapshot | null,
  incoming: LiveRoomSnapshot,
  opts?: { pendingDraws?: ProcessedDraw[] }
): ApplySnapshotResult {
  const pending = opts?.pendingDraws ?? [];
  const drawSource = resolveDrawSource(incoming) ?? resolveDrawSource(prev ?? undefined);

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

  const cards = preserveLiveRoomCards(prev?.cards, incoming.cards, incoming);

  const snapshot: LiveRoomSnapshot = {
    ...(prev ?? incoming),
    ...incoming,
    cards,
    draws: mergedDraws,
    eventSeq:
      incoming.eventSeq != null
        ? Math.max(prev?.eventSeq ?? 0, incoming.eventSeq)
        : prev?.eventSeq,
  };

  return { accepted: true, snapshot };
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
