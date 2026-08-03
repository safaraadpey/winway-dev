/**
 * Convert a non-negative integer to Persian words (up to trillions).
 */

const ONES = [
  "",
  "یک",
  "دو",
  "سه",
  "چهار",
  "پنج",
  "شش",
  "هفت",
  "هشت",
  "نه",
];
const TEENS = [
  "ده",
  "یازده",
  "دوازده",
  "سیزده",
  "چهارده",
  "پانزده",
  "شانزده",
  "هفده",
  "هجده",
  "نوزده",
];
const TENS = [
  "",
  "",
  "بیست",
  "سی",
  "چهل",
  "پنجاه",
  "شصت",
  "هفتاد",
  "هشتاد",
  "نود",
];
const HUNDREDS = [
  "",
  "صد",
  "دویست",
  "سیصد",
  "چهارصد",
  "پانصد",
  "ششصد",
  "هفتصد",
  "هشتصد",
  "نهصد",
];
const SCALES = ["", "هزار", "میلیون", "میلیارد", "تریلیون"];

function threeDigitsToWords(n: number): string {
  if (n <= 0) return "";
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]!);
  if (rem >= 10 && rem <= 19) {
    parts.push(TEENS[rem - 10]!);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t > 0) parts.push(TENS[t]!);
    if (o > 0) parts.push(ONES[o]!);
  }
  return parts.join(" و ");
}

export function numberToPersianWords(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "";
  const n = Math.floor(value);
  if (n === 0) return "صفر";

  const groups: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]!;
    if (group === 0) continue;
    const words = threeDigitsToWords(group);
    const scale = SCALES[i] || "";
    parts.push(scale ? `${words} ${scale}` : words);
  }

  return parts.join(" و ");
}

/** Convert rials to whole tomans (1 toman = 10 rials). */
export function rialsToTomans(rials: number): number {
  if (!Number.isFinite(rials) || rials <= 0) return 0;
  return Math.floor(rials / 10);
}
