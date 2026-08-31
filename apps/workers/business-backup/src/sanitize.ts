/** Strip denylisted columns before persisting source_row. */
const TABLE_DENYLIST: Record<string, string[]> = {
  "public.rooms": [
    "password",
    "room_seed",
    "engine_owner_id",
    "engine_lease_until",
    "engine_claimed_at",
    "engine_loop_state",
    "engine_lease_epoch",
  ],
  "public.room_templates": ["password"],
  "public.kyc_submissions": ["image_data"],
};

const GLOBAL_DENY = new Set(["room_seed"]);

export function sanitizeRow(
  tableKey: string,
  row: Record<string, unknown>
): Record<string, unknown> {
  const deny = new Set([...(TABLE_DENYLIST[tableKey] ?? []), ...GLOBAL_DENY]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (deny.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/** rooms.room_seed allowed only in seed reveal archive. */
export function sanitizeRoomForArchive(
  row: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeRow("public.rooms", row);
}

export function sanitizeKycRow(
  row: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeRow("public.kyc_submissions", row);
}
