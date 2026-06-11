import type { GameRepo } from "../../repositories/index.js";
import type { Logger } from "../../metrics/logger.js";
import { buildRegistryFromCardNumbers, buildRegistryFromDbRows } from "./build.js";
import type { GlobalCardRegistry } from "./types.js";

let cached: GlobalCardRegistry | null = null;
let loadPromise: Promise<GlobalCardRegistry> | null = null;

/**
 * Process-wide singleton. Card definitions are global and immutable;
 * loaded once and shared by every room.
 */
export async function getGlobalCardRegistry(
  repo: GameRepo,
  log: Logger
): Promise<GlobalCardRegistry> {
  if (cached) return cached;
  if (loadPromise) return loadPromise;

  loadPromise = load(repo, log);
  try {
    cached = await loadPromise;
    return cached;
  } finally {
    loadPromise = null;
  }
}

/** Test / hot-reload hook — not for production draw path. */
export function setGlobalCardRegistryForTests(registry: GlobalCardRegistry | null): void {
  cached = registry;
  loadPromise = null;
}

async function load(repo: GameRepo, log: Logger): Promise<GlobalCardRegistry> {
  const t0 = performance.now();
  let registry: GlobalCardRegistry;
  let source: "db_masks" | "card_numbers_fallback" = "db_masks";
  let maskRowsLoaded = 0;
  let indexRowsLoaded = 0;

  try {
    const [maskRows, indexRows] = await Promise.all([
      repo.getCardDefinitionMasks(),
      repo.getCardNumberIndex(),
    ]);
    maskRowsLoaded = maskRows.length;
    indexRowsLoaded = indexRows.length;
    const minExpectedIndex = maskRows.length * 10;
    const indexLooksComplete =
      maskRows.length > 0 &&
      indexRows.length > 0 &&
      indexRows.length >= minExpectedIndex;

    if (indexLooksComplete) {
      registry = buildRegistryFromDbRows(maskRows, indexRows);
    } else if (maskRows.length > 0 || indexRows.length > 0) {
      log.warn("card registry incomplete db load; using card_numbers fallback", {
        maskRows: maskRows.length,
        indexRows: indexRows.length,
        minExpectedIndex,
      });
      source = "card_numbers_fallback";
      const rows = await repo.getAllCardNumbersForRegistry();
      registry = buildRegistryFromCardNumbers(rows);
    } else {
      source = "card_numbers_fallback";
      const rows = await repo.getAllCardNumbersForRegistry();
      registry = buildRegistryFromCardNumbers(rows);
    }
  } catch (err) {
    log.warn("card registry bitmask tables unavailable; building from card_numbers", {
      error: err instanceof Error ? err.message : String(err),
    });
    source = "card_numbers_fallback";
    const rows = await repo.getAllCardNumbersForRegistry();
    registry = buildRegistryFromCardNumbers(rows);
  }

  log.info("global card registry loaded", {
    source,
    cardCount: registry.cardCount,
    indexEntryCount: registry.indexEntryCount,
    maskRowsLoaded,
    indexRowsLoaded,
    loadDurationMs: Math.round(performance.now() - t0),
  });
  return registry;
}
