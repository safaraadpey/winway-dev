/** Test tournaments (`meta.is_test_tournament`) are adminzero-only. */

export function isTestTournamentMeta(meta: unknown): boolean {
  return (
    !!meta &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    (meta as { is_test_tournament?: unknown }).is_test_tournament === true
  );
}

/**
 * Remove the test-tournament flag so non-adminzero actors cannot set it.
 * Does not add unsupported top-level keys to RPC patches.
 */
export function stripTestTournamentFlag(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...payload };
  if ("is_test_tournament" in next) {
    delete next.is_test_tournament;
  }
  if (next.meta && typeof next.meta === "object" && !Array.isArray(next.meta)) {
    const meta = { ...(next.meta as Record<string, unknown>) };
    if ("is_test_tournament" in meta) {
      delete meta.is_test_tournament;
    }
    next.meta = meta;
  }
  return next;
}
