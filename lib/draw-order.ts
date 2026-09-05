/**
 * Authoritative draw ordering for live room UI.
 * Order = call sequence (processed_at), never bingo ball value.
 */

export type ProcessedDraw = {
  id?: string;
  number: number;
  created_at: string;
  processed_at?: string;
};

export function drawKey(draw: ProcessedDraw): string {
  return draw.id ?? `n:${draw.number}`;
}

export function sortDraws(draws: readonly ProcessedDraw[]): ProcessedDraw[] {
  return [...draws].sort((a, b) => {
    const procA = a.processed_at ?? a.created_at;
    const procB = b.processed_at ?? b.created_at;
    const byProcessed = procA.localeCompare(procB);
    if (byProcessed !== 0) return byProcessed;

    const byCreated = a.created_at.localeCompare(b.created_at);
    if (byCreated !== 0) return byCreated;

    if (a.id && b.id) return a.id.localeCompare(b.id);
    return 0;
  });
}

export type LiveDrawSource = "engine_ram" | "pg" | undefined;

/** Preserve engine_ram API array order; per_draw/PG keeps timestamp sort. */
export function orderDrawsForLiveRoom(
  draws: readonly ProcessedDraw[],
  source?: LiveDrawSource
): ProcessedDraw[] {
  if (source === "engine_ram") {
    return [...draws];
  }
  return sortDraws(draws);
}

/** Merge draw rows; incoming server fields win on conflict. */
export function mergeDrawLists(
  existing: readonly ProcessedDraw[],
  incoming: readonly ProcessedDraw[]
): ProcessedDraw[] {
  const byKey = new Map<string, ProcessedDraw>();
  for (const d of existing) {
    byKey.set(drawKey(d), d);
  }
  for (const d of incoming) {
    const key = drawKey(d);
    const prev = byKey.get(key);
    byKey.set(
      key,
      prev
        ? {
            ...prev,
            ...d,
            processed_at: d.processed_at ?? prev.processed_at,
            created_at: d.created_at || prev.created_at,
          }
        : d
    );
  }
  return sortDraws([...byKey.values()]);
}

/** Merge draws respecting engine_ram call-sequence order from the server. */
export function mergeDrawListsForLiveRoom(
  existing: readonly ProcessedDraw[],
  incoming: readonly ProcessedDraw[],
  source?: LiveDrawSource
): ProcessedDraw[] {
  if (source === "engine_ram") {
    if (incoming.length === 0) return [...existing];
    // Never shrink — stale/partial polls must not rewind draw count (DrawStrip 90/x).
    if (existing.length === 0 || incoming.length >= existing.length) {
      return [...incoming];
    }
    return [...existing];
  }
  return mergeDrawLists(existing, incoming);
}
