export function normalizeReferralCodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toUpperCase();
  } catch {
    return raw.trim().toUpperCase();
  }
}

export function normalizeReferralRefParam(
  ref: string | string[] | undefined
): string {
  const raw = Array.isArray(ref) ? ref[0] : ref;
  if (!raw?.trim()) {
    return "";
  }
  return normalizeReferralCodeSegment(raw);
}
