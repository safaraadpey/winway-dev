import { toJalaliDate } from "@/lib/kyc/declaration";

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]!);
}

const PERSIAN_MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** Shamsi date + time, e.g. ۱۴۰۵/۰۶/۰۱ ۱۹:۲۸ */
export function formatShamsiDateTime(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return "—";

  const { jy, jm, jd } = toJalaliDate(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return toPersianDigits(
    `${jy}/${pad(jm)}/${pad(jd)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export type ShamsiEventDateTimeParts = {
  day: number;
  month: string;
  time: string;
};

export function getShamsiEventDateTimeParts(
  dateInput: string | Date
): ShamsiEventDateTimeParts | null {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return null;

  const { jm, jd } = toJalaliDate(date);
  const monthName = PERSIAN_MONTH_NAMES[jm - 1] ?? "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    day: jd,
    month: monthName,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/** Shamsi event label, e.g. 6 مرداد 21:00 */
export function formatShamsiEventDateTime(dateInput: string | Date): string {
  const parts = getShamsiEventDateTimeParts(dateInput);
  if (!parts) return "—";
  return `${parts.day} ${parts.month} ${parts.time}`;
}
