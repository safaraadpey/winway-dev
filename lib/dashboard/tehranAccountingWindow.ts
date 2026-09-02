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

/** Start of the open 08:00–08:00 Asia/Tehran accounting window containing `now`. */
export function getOpenTehranAccountingWindowFrom(now = new Date()): Date {
  const p = tehranParts(now);
  let windowYear = p.year;
  let windowMonth = p.month;
  let windowDay = p.day;

  if (p.hour < 8) {
    const prev = new Date(Date.UTC(p.year, p.month - 1, p.day - 1));
    windowYear = prev.getUTCFullYear();
    windowMonth = prev.getUTCMonth() + 1;
    windowDay = prev.getUTCDate();
  }

  return new Date(
    Date.UTC(windowYear, windowMonth - 1, windowDay, 8, 0, 0, 0) - TEHRAN_OFFSET_MS
  );
}

/** YYYY-MM-DD calendar date in Asia/Tehran. */
export function tehranDateString(parts: {
  year: number;
  month: number;
  day: number;
}): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function addTehranCalendarDays(
  parts: { year: number; month: number; day: number },
  deltaDays: number
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** Last closed accounting day (inclusive snapshot_date). */
export function getLastClosedTehranSnapshotDate(now = new Date()): string {
  const endExclusive = getOpenTehranAccountingWindowFrom(now);
  const endBoundaryParts = tehranParts(endExclusive);
  const throughParts = addTehranCalendarDays(endBoundaryParts, -1);
  return tehranDateString(throughParts);
}

function parseTehranDateString(value: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return { year, month, day };
}

/**
 * Closed week for snapshot aggregation: Saturday 08:00 Tehran through current day 08:00 Tehran.
 * Returns inclusive snapshot_date bounds (performance_daily_stats.snapshot_date).
 */
export function getTehranWeekSnapshotDateRange(now = new Date()): {
  fromSnapshotDate: string;
  throughSnapshotDate: string;
} {
  const throughSnapshotDate = getLastClosedTehranSnapshotDate(now);
  const throughParts = parseTehranDateString(throughSnapshotDate);
  if (!throughParts) {
    return { fromSnapshotDate: throughSnapshotDate, throughSnapshotDate };
  }

  const jsDay = new Date(
    Date.UTC(throughParts.year, throughParts.month - 1, throughParts.day)
  ).getUTCDay();
  const daysSinceSaturday = (jsDay + 1) % 7;
  const fromParts = addTehranCalendarDays(throughParts, -daysSinceSaturday);
  const fromSnapshotDate = tehranDateString(fromParts);

  return { fromSnapshotDate, throughSnapshotDate };
}

/**
 * Custom closed range: [fromBoundaryDate 08:00 Tehran, toBoundaryDate 08:00 Tehran).
 * Maps to inclusive snapshot_date bounds. Caps through at last closed accounting day.
 */
export function getTehranSnapshotDateRangeFromBounds(
  fromBoundaryDate: string,
  toBoundaryDate: string,
  now = new Date()
): { fromSnapshotDate: string; throughSnapshotDate: string } | null {
  const fromParts = parseTehranDateString(fromBoundaryDate);
  const toParts = parseTehranDateString(toBoundaryDate);
  if (!fromParts || !toParts) return null;

  const fromSnapshotDate = tehranDateString(fromParts);
  const toBoundary = tehranDateString(toParts);
  if (toBoundary <= fromSnapshotDate) return null;

  let throughSnapshotDate = tehranDateString(addTehranCalendarDays(toParts, -1));
  const maxClosed = getLastClosedTehranSnapshotDate(now);
  if (throughSnapshotDate > maxClosed) {
    throughSnapshotDate = maxClosed;
  }
  if (fromSnapshotDate > throughSnapshotDate) return null;

  return { fromSnapshotDate, throughSnapshotDate };
}

/** Live open accounting window: last 08:00 Tehran → request time. */
export function getOpenTehranAccountingWindow(now = new Date()): {
  fromIso: string;
  toIso: string;
} {
  return {
    fromIso: getOpenTehranAccountingWindowFrom(now).toISOString(),
    toIso: now.toISOString(),
  };
}

/** 08:00 Asia/Tehran on a calendar date → UTC ISO. */
export function tehranSnapshotDateToWindowStartIso(snapshotDate: string): string | null {
  const parts = parseTehranDateString(snapshotDate);
  if (!parts) return null;
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 8, 0, 0, 0) - TEHRAN_OFFSET_MS
  ).toISOString();
}

/**
 * Closed snapshot bounds → half-open UTC window
 * [fromSnapshotDate 08:00 Tehran, day after throughSnapshotDate 08:00 Tehran).
 */
export function getTehranClosedPeriodIsoBounds(
  fromSnapshotDate: string,
  throughSnapshotDate: string
): { fromIso: string; toExclusiveIso: string } | null {
  const fromIso = tehranSnapshotDateToWindowStartIso(fromSnapshotDate);
  const throughParts = parseTehranDateString(throughSnapshotDate);
  if (!fromIso || !throughParts) return null;

  const nextDay = addTehranCalendarDays(throughParts, 1);
  const toExclusiveIso = tehranSnapshotDateToWindowStartIso(tehranDateString(nextDay));
  if (!toExclusiveIso) return null;

  return { fromIso, toExclusiveIso };
}

export function toInclusiveEndIso(toExclusiveIso: string): string {
  return new Date(new Date(toExclusiveIso).getTime() - 1).toISOString();
}

export function getTehranWeekClosedPeriodIsoBounds(now = new Date()): {
  fromSnapshotDate: string;
  throughSnapshotDate: string;
  fromIso: string;
  toExclusiveIso: string;
} | null {
  const { fromSnapshotDate, throughSnapshotDate } = getTehranWeekSnapshotDateRange(now);
  const bounds = getTehranClosedPeriodIsoBounds(fromSnapshotDate, throughSnapshotDate);
  if (!bounds) return null;
  return { fromSnapshotDate, throughSnapshotDate, ...bounds };
}
