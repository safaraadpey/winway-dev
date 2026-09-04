/**
 * Pre-fix shadow MISMATCH rooms. Forensic only — do not re-settle, do not
 * count toward the post-reset proof gate.
 */
export const HISTORICAL_SHADOW_MISMATCH_ROOM_CODES = [
  "FA9449",
  "97E055",
  "C277FA",
  "F1D235",
  "BEE2F2",
  "345603",
  "D2ECB3",
  "2F5281",
  "4C1E58",
  "FAD96B",
  "ABA595",
  "714730",
  "CF46D5",
  "CFBFCA",
  "18936F",
  "51800B",
] as const;
