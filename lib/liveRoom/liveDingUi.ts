import type { LiveRoomSnapshot } from "@/services/rooms";

export type DingSettleMode = "per_draw" | "room_level";

export function resolveDingSettleMode(
  mode: string | null | undefined
): DingSettleMode {
  return mode === "room_level" ? "room_level" : "per_draw";
}

export function isRoomLevelDingUi(mode: string | null | undefined): boolean {
  return resolveDingSettleMode(mode) === "room_level";
}

/** Legacy per_draw only: mid-game header credit on ball reveal. */
export function shouldCreditDingOnLiveReveal(
  mode: string | null | undefined,
  gameplayPersistMode?: string | null | undefined,
  source?: LiveRoomSnapshot["source"]
): boolean {
  if (gameplayPersistMode === "manifest_ram") return false;
  if (source === "engine_ram") return false;
  return !isRoomLevelDingUi(mode);
}

export function canApplyLiveDingRevealCredit(
  mode: DingSettleMode | null | undefined
): boolean {
  return mode !== "room_level";
}

export function countMatchedMyCardsForDing(
  cards: LiveRoomSnapshot["cards"] | null | undefined,
  number: number
): number {
  if (!cards?.length) return 0;
  return cards.reduce((count, card) => {
    if (!card.is_my_card) return count;
    const hasNumber =
      card.card?.some((row) => row.some((value) => value === number)) ?? false;
    return hasNumber ? count + 1 : count;
  }, 0);
}

export function computePerDrawRevealDingDelta(
  matchedCards: number,
  dingPerNumber: number | null | undefined
): number {
  if (matchedCards <= 0) return 0;
  const rate = Math.max(0, Number(dingPerNumber ?? 1) || 1);
  return matchedCards * rate;
}

export function buildPerDrawRevealCredit(
  snapshot: LiveRoomSnapshot | null | undefined,
  drawNumber: number
): { revealKey: string; delta: number } | null {
  if (!snapshot?.room?.id || drawNumber == null) return null;
  if (
    !shouldCreditDingOnLiveReveal(
      snapshot.room.ding_settle_mode,
      snapshot.room.gameplay_persist_mode,
      snapshot.source
    )
  ) {
    return null;
  }

  const matchedCards = countMatchedMyCardsForDing(snapshot.cards, drawNumber);
  const delta = computePerDrawRevealDingDelta(
    matchedCards,
    snapshot.room.ding_per_number
  );
  if (delta <= 0) return null;

  return {
    revealKey: `${snapshot.room.id}:${drawNumber}`,
    delta,
  };
}
