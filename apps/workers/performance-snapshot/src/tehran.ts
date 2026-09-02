/** Iran uses fixed UTC+3:30 (no DST since 2022). */
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

export function tehranParts(now = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const shifted = new Date(now.getTime() + TEHRAN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** YYYY-MM-DD calendar date in Asia/Tehran. */
export function tehranSnapshotDate(now = new Date()): string {
  const p = tehranParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function msUntilNextTehranRun(
  now = new Date(),
  hour = 8,
  minute = 5
): number {
  const p = tehranParts(now);
  let targetDay = p.day;
  let targetMonth = p.month;
  let targetYear = p.year;

  const pastRunTime =
    p.hour > hour || (p.hour === hour && p.minute >= minute);

  if (pastRunTime) {
    const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    targetYear = next.getUTCFullYear();
    targetMonth = next.getUTCMonth() + 1;
    targetDay = next.getUTCDate();
  }

  const targetTehranUtcMs =
    Date.UTC(targetYear, targetMonth - 1, targetDay, hour, minute, 0, 0) -
    TEHRAN_OFFSET_MS;

  return Math.max(0, targetTehranUtcMs - now.getTime());
}
