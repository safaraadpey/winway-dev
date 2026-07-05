import type { CardPoolDefinition, CardPoolVersionMeta } from "@/lib/cardPool/types";

const DB_NAME = "winway_card_pool_v1";
const DB_VERSION = 1;
const META_STORE = "meta";
const DEFINITIONS_STORE = "definitions";

type StoredMeta = CardPoolVersionMeta & {
  versionKey: string;
  storedAt: number;
};

type StoredDefinition = {
  poolCardId: string;
  cardNo: number;
  card: (number | null)[][];
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
      if (!db.objectStoreNames.contains(DEFINITIONS_STORE)) {
        db.createObjectStore(DEFINITIONS_STORE, { keyPath: "poolCardId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
  });
}

function runTx<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = fn(store);
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexedDB transaction aborted"));
  });
}

export async function readCardPoolMetaFromIdb(): Promise<StoredMeta | null> {
  if (!isBrowser()) return null;

  try {
    const db = await openDb();
    const meta = await runTx<StoredMeta | undefined>(db, META_STORE, "readonly", (store) =>
      store.get("current")
    );
    return meta ?? null;
  } catch (err) {
    console.warn("[CardPoolCache] readCardPoolMetaFromIdb failed:", err);
    return null;
  }
}

export async function writeCardPoolCacheToIdb(
  meta: StoredMeta,
  definitions: CardPoolDefinition[]
): Promise<void> {
  if (!isBrowser()) return;

  const db = await openDb();
  await runTx(db, DEFINITIONS_STORE, "readwrite", (store) => store.clear());
  await runTx(db, META_STORE, "readwrite", (store) => store.put(meta, "current"));

  const chunkSize = 50;
  for (let i = 0; i < definitions.length; i += chunkSize) {
    const chunk = definitions.slice(i, i + chunkSize);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DEFINITIONS_STORE, "readwrite");
      const store = tx.objectStore(DEFINITIONS_STORE);
      for (const def of chunk) {
        const row: StoredDefinition = {
          poolCardId: def.poolCardId,
          cardNo: def.cardNo,
          card: def.card,
        };
        store.put(row);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB write failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexedDB write aborted"));
    });
  }
}

export async function readAllCardPoolDefinitionsFromIdb(): Promise<Map<string, StoredDefinition>> {
  const map = new Map<string, StoredDefinition>();
  if (!isBrowser()) return map;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DEFINITIONS_STORE, "readonly");
      const store = tx.objectStore(DEFINITIONS_STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const value = cursor.value as StoredDefinition;
        map.set(value.poolCardId, value);
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB read failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexedDB read aborted"));
    });
  } catch (err) {
    console.warn("[CardPoolCache] readAllCardPoolDefinitionsFromIdb failed:", err);
  }

  return map;
}

export async function clearCardPoolIdb(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await openDb();
    await runTx(db, DEFINITIONS_STORE, "readwrite", (store) => store.clear());
    await runTx(db, META_STORE, "readwrite", (store) => store.delete("current"));
  } catch (err) {
    console.warn("[CardPoolCache] clearCardPoolIdb failed:", err);
  }
}
