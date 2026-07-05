import { supabase } from "@/lib/supabaseClient";
import { isCardPoolCacheEnabled } from "@/lib/cardPool/config";
import {
  clearCardPoolIdb,
  readAllCardPoolDefinitionsFromIdb,
  readCardPoolMetaFromIdb,
  writeCardPoolCacheToIdb,
} from "@/lib/cardPool/indexedDb";
import {
  buildCardPoolVersionKey,
  type CardPoolDefinition,
  type CardPoolVersionMeta,
} from "@/lib/cardPool/types";

type DefinitionMap = Map<string, CardPoolDefinition>;

let memoryVersionKey: string | null = null;
let memoryDefinitions: DefinitionMap | null = null;
let warmInFlight: Promise<boolean> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function clearCardPoolMemoryCache(): void {
  memoryVersionKey = null;
  memoryDefinitions = null;
  warmInFlight = null;
}

export function isCardPoolCacheWarmFor(meta: CardPoolVersionMeta | null | undefined): boolean {
  if (!meta) return false;
  const versionKey = buildCardPoolVersionKey(meta);
  return memoryVersionKey === versionKey && Boolean(memoryDefinitions?.size);
}

async function fetchDefinitionsFromApi(
  meta: CardPoolVersionMeta,
  ifVersion?: string | null
): Promise<{ notModified: boolean; definitions: CardPoolDefinition[]; versionKey: string }> {
  const search = new URLSearchParams();
  search.set("poolId", meta.poolId);
  if (ifVersion) search.set("ifVersion", ifVersion);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;

  const res = await fetch(`/api/player/card-pool/definitions?${search.toString()}`, {
    method: "GET",
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 304) {
    const versionKey =
      res.headers.get("X-Card-Pool-Version") ?? buildCardPoolVersionKey(meta);
    return { notModified: true, definitions: [], versionKey };
  }

  if (!res.ok) {
    throw new Error(`card pool definitions fetch failed (${res.status})`);
  }

  const body = (await res.json()) as {
    ok: boolean;
    versionKey: string;
    definitions: CardPoolDefinition[];
  };

  return {
    notModified: false,
    definitions: body.definitions ?? [],
    versionKey: body.versionKey ?? buildCardPoolVersionKey(meta),
  };
}

async function hydrateMemoryFromIdb(expectedVersionKey: string): Promise<boolean> {
  const storedMeta = await readCardPoolMetaFromIdb();
  if (!storedMeta || storedMeta.versionKey !== expectedVersionKey) {
    return false;
  }

  const rows = await readAllCardPoolDefinitionsFromIdb();
  if (rows.size === 0) return false;

  const map: DefinitionMap = new Map();
  for (const row of rows.values()) {
    map.set(row.poolCardId, {
      poolCardId: row.poolCardId,
      cardNo: row.cardNo,
      card: row.card,
    });
  }

  memoryVersionKey = expectedVersionKey;
  memoryDefinitions = map;
  return true;
}

export async function ensureCardPoolCache(meta: CardPoolVersionMeta): Promise<boolean> {
  if (!isCardPoolCacheEnabled() || !isBrowser() || !meta.poolId) {
    return false;
  }

  const versionKey = buildCardPoolVersionKey(meta);
  if (isCardPoolCacheWarmFor(meta)) {
    return true;
  }

  if (warmInFlight) {
    return warmInFlight;
  }

  warmInFlight = (async () => {
    try {
      const storedMeta = await readCardPoolMetaFromIdb();
      const storedVersionKey = storedMeta?.versionKey ?? null;

      if (storedVersionKey === versionKey) {
        const hydrated = await hydrateMemoryFromIdb(versionKey);
        if (hydrated) {
          console.info("[CardPoolCache] memory hydrated from IndexedDB", { versionKey });
          return true;
        }
      } else if (storedVersionKey && storedVersionKey !== versionKey) {
        console.info("[CardPoolCache] version mismatch — clearing IndexedDB", {
          storedVersionKey,
          versionKey,
        });
        await clearCardPoolIdb();
        clearCardPoolMemoryCache();
      }

      const fetchResult = await fetchDefinitionsFromApi(
        meta,
        storedVersionKey === versionKey ? versionKey : null
      );

      if (fetchResult.notModified) {
        const hydrated = await hydrateMemoryFromIdb(versionKey);
        if (hydrated) {
          console.info("[CardPoolCache] 304 — hydrated from IndexedDB", { versionKey });
          return true;
        }
      }

      if (fetchResult.definitions.length === 0) {
        return false;
      }

      const map: DefinitionMap = new Map();
      for (const def of fetchResult.definitions) {
        map.set(def.poolCardId, def);
      }

      memoryVersionKey = fetchResult.versionKey;
      memoryDefinitions = map;

      await writeCardPoolCacheToIdb(
        {
          ...meta,
          versionKey: fetchResult.versionKey,
          storedAt: Date.now(),
        },
        fetchResult.definitions
      );

      console.info("[CardPoolCache] definitions cached", {
        versionKey: fetchResult.versionKey,
        definitionCount: fetchResult.definitions.length,
      });
      return true;
    } catch (err) {
      console.warn("[CardPoolCache] ensureCardPoolCache failed:", err);
      return false;
    } finally {
      warmInFlight = null;
    }
  })();

  return warmInFlight;
}

export function getCachedCardGrid(poolCardId: string | null | undefined): (number | null)[][] | null {
  if (!poolCardId || !memoryDefinitions) return null;
  return memoryDefinitions.get(String(poolCardId))?.card ?? null;
}

export function getCachedCardGridByCardNo(cardNo: number | null | undefined): (number | null)[][] | null {
  if (cardNo == null || !memoryDefinitions) return null;
  for (const def of memoryDefinitions.values()) {
    if (def.cardNo === cardNo) return def.card;
  }
  return null;
}

export function shouldUseDrawsOnlyLiveRoomFallback(
  meta: CardPoolVersionMeta | null | undefined
): boolean {
  return isCardPoolCacheEnabled() && isCardPoolCacheWarmFor(meta);
}
