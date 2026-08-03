/**
 * Builds the handwritten declaration text and KYC code shown to the player.
 */

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]!);
}

/** Gregorian → Jalali. */
export function toJalaliDate(date: Date = new Date()): {
  jy: number;
  jm: number;
  jd: number;
} {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();

  let gYear = gy - 1600;
  const gMonth = gm - 1;
  const gDay = gd - 1;
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  let gDayNo =
    365 * gYear +
    Math.floor((gYear + 3) / 4) -
    Math.floor((gYear + 99) / 100) +
    Math.floor((gYear + 399) / 400);

  for (let i = 0; i < gMonth; i++) {
    gDayNo += monthDays[i]!;
  }
  if (
    gMonth > 1 &&
    ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)
  ) {
    gDayNo += 1;
  }
  gDayNo += gDay;

  let jDayNo = gDayNo - 79;
  const jNp = Math.floor(jDayNo / 12053);
  jDayNo %= 12053;

  let jy = 979 + 33 * jNp + 4 * Math.floor(jDayNo / 1461);
  jDayNo %= 1461;

  if (jDayNo >= 366) {
    jy += Math.floor((jDayNo - 1) / 365);
    jDayNo = (jDayNo - 1) % 365;
  }

  const jMonthDays = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  let jm = 0;
  for (; jm < 11 && jDayNo >= jMonthDays[jm]!; jm++) {
    jDayNo -= jMonthDays[jm]!;
  }

  return { jy, jm: jm + 1, jd: jDayNo + 1 };
}

export function formatJalaliDate(date: Date = new Date()): string {
  const { jy, jm, jd } = toJalaliDate(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return toPersianDigits(`${jy}/${pad(jm)}/${pad(jd)}`);
}

export function buildKycCode(userId: string): string {
  const compact = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `KYC-${compact}`;
}

export function buildServerKycPayload(
  _userId: string,
  _displayName: string,
  date = new Date()
): { kycCode: string; declarationText: string; fullText: string } {
  const kycCode = buildKycCode(_userId);
  const declarationBody =
    'اینجانب "اسم و فامیل" با رضایت و آگاهی کامل، خرید خود را از طریق درگاه بانکی این سرویس انجام می‌دهم. خداوند به طرفین برکت بدهد.';
  const dateLine = `تاریخ: ${formatJalaliDate(date)}`;
  return {
    kycCode,
    declarationText: `${declarationBody}\n${dateLine}`,
    fullText: `${kycCode}\n${declarationBody}\n${dateLine}`,
  };
}
