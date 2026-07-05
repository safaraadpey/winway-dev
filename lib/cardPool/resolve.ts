import { getCachedCardGrid, getCachedCardGridByCardNo } from "@/lib/cardPool/client";
import { isCardPoolCacheEnabled } from "@/lib/cardPool/config";
import type { CardPoolVersionMeta } from "@/lib/cardPool/types";
import type { LiveRoomSnapshot } from "@/services/rooms";

function gridsMatch(
  a: (number | null)[][],
  b: (number | null)[][]
): boolean {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    const rowA = a[r] ?? [];
    const rowB = b[r] ?? [];
    if (rowA.length !== rowB.length) return false;
    for (let c = 0; c < rowA.length; c++) {
      if (rowA[c] !== rowB[c]) return false;
    }
  }
  return true;
}

export function applyCardPoolCacheToSnapshot(
  snapshot: LiveRoomSnapshot,
  meta: CardPoolVersionMeta | null | undefined
): LiveRoomSnapshot {
  if (!isCardPoolCacheEnabled() || !meta || !snapshot.cards?.length) {
    return snapshot;
  }

  let replaced = 0;
  let verified = 0;

  const cards = snapshot.cards.map((card) => {
    const poolCardId = card.pool_card_id ?? null;
    const cached =
      getCachedCardGrid(poolCardId) ??
      getCachedCardGridByCardNo(card.card_number);

    if (!cached) return card;

    if (card.card?.length && gridsMatch(card.card, cached)) {
      verified += 1;
      return card;
    }

    replaced += 1;
    return {
      ...card,
      card: cached,
    };
  });

  if (replaced > 0 || verified > 0) {
    console.info("[CardPoolCache] snapshot cards resolved from cache", {
      versionKey: `${meta.commitHash}:${meta.prngVersion}`,
      replaced,
      verified,
      total: cards.length,
    });
  }

  return { ...snapshot, cards };
}
