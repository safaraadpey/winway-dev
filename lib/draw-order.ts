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
  const n = Number(draw.number);
  if (Number.isFinite(n) && n >= 1 && n <= 90) return `n:${n}`;
  return draw.id ?? `n:${draw.number}`;
}

/** Bingo has 90 unique balls — drop duplicate numbers, keep first call order. */
export function uniqueDrawsInCallOrder(
  draws: readonly ProcessedDraw[]
): ProcessedDraw[] {
  const seen = new Set<number>();
  const out: ProcessedDraw[] = [];
  for (const draw of draws) {
    const n = Number(draw.number);
    if (!Number.isFinite(n) || n < 1 || n > 90 || seen.has(n)) continue;
    seen.add(n);
    out.push({ ...draw, number: n });
  }
  return out;
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
    return uniqueDrawsInCallOrder(draws);
  }
  return uniqueDrawsInCallOrder(sortDraws(draws));
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

function looksLikeEngineRamDrawIds(draws: readonly ProcessedDraw[]): boolean {
  if (draws.length === 0) return false;
  return draws.every((d) => !d.id || d.id.startsWith("ram-"));
}

/** Merge draws respecting engine_ram call-sequence order from the server. */
export function mergeDrawListsForLiveRoom(
  existing: readonly ProcessedDraw[],
  incoming: readonly ProcessedDraw[],
  source?: LiveDrawSource
): ProcessedDraw[] {
  if (source === "engine_ram") {
    const prev = uniqueDrawsInCallOrder(existing);
    const next = uniqueDrawsInCallOrder(incoming);
    if (next.length === 0) return prev;
    if (prev.length === 0) return next;
    // Live engine polls: take the longer RAM array. Never shrink.
    if (looksLikeEngineRamDrawIds(incoming) && next.length >= prev.length) {
      return next;
    }
    if (looksLikeEngineRamDrawIds(incoming)) {
      return prev;
    }
    // Post-finish PG dump: keep RAM call order, only append missing balls.
    const seen = new Set(prev.map((d) => d.number));
    return [...prev, ...next.filter((d) => !seen.has(d.number))];
  }
  return uniqueDrawsInCallOrder(mergeDrawLists(existing, incoming));
}
