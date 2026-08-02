/** Normalize pool_card_id (bigint in DB) for consistent Map keys. */
export function normalizePoolCardId(id: string | number): string {
  return String(id);
}
