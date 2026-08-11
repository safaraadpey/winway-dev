/**
 * Iranian Sheba (IBAN): IR + 24 digits = 26 characters.
 */

export function stripShebaChars(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Normalize to IR + 24 digits when possible; otherwise return cleaned digits/letters. */
export function normalizeSheba(raw: string): string {
  let s = stripShebaChars(raw);
  if (s.startsWith("IR")) {
    s = "IR" + s.slice(2).replace(/\D/g, "");
  } else {
    s = s.replace(/\D/g, "");
    if (s.length > 0) s = "IR" + s;
  }
  // Cap at IR + 24 digits
  if (s.startsWith("IR") && s.length > 26) {
    s = s.slice(0, 26);
  }
  return s;
}

/** Display: IR12-3456-7890-1234-5678-9012-34 */
export function formatShebaDisplay(raw: string): string {
  const normalized = normalizeSheba(raw);
  if (!normalized) return "";
  if (!normalized.startsWith("IR")) return normalized;
  const digits = normalized.slice(2);
  const parts = [digits.slice(0, 2)];
  for (let i = 2; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4));
  }
  return `IR${parts.filter(Boolean).join("-")}`;
}

export function isValidSheba(raw: string): boolean {
  const s = normalizeSheba(raw);
  return /^IR\d{24}$/.test(s);
}
