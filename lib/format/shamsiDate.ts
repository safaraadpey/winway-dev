import { toJalaliDate } from "@/lib/kyc/declaration";

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]!);
}

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
