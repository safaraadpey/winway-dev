import type { LeoTimeBand } from "./types";

export const LEO_TIMEZONE = "Asia/Tehran";

export type TimeBandWindow = {
  band: LeoTimeBand;
  startHour: number;
  endHour: number;
  labelFa: string;
};

export const LEO_TIME_BAND_WINDOWS: Record<LeoTimeBand, TimeBandWindow> = {
  midnight: { band: "midnight", startHour: 0, endHour: 5, labelFa: "نیمه‌شب (۰۰–۰۵)" },
  dawn: { band: "dawn", startHour: 5, endHour: 8, labelFa: "سحر (۰۵–۰۸)" },
  morning: { band: "morning", startHour: 8, endHour: 11, labelFa: "صبح (۰۸–۱۱)" },
  noon: { band: "noon", startHour: 11, endHour: 16, labelFa: "ظهر (۱۱–۱۶)" },
  afternoon: { band: "afternoon", startHour: 16, endHour: 19, labelFa: "عصر (۱۶–۱۹)" },
  evening: { band: "evening", startHour: 19, endHour: 24, labelFa: "شب (۱۹–۲۴)" },
};

/** Build UTC Date for a local Tehran instant on windowDate (YYYY-MM-DD). */
export function tehranLocalToUtc(
  windowDate: string,
  hour: number,
  minute: number,
  second = 0
): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  const localIso = `${windowDate}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
  const probe = new Date(localIso + "Z");
  const tehranParts = new Intl.DateTimeFormat("en-US", {
    timeZone: LEO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(probe);

  const get = (type: string) => Number(tehranParts.find((p) => p.type === type)?.value ?? 0);
  const gotHour = get("hour");
  const gotMinute = get("minute");
  const targetMinutes = hour * 60 + minute;
  const gotMinutes = gotHour * 60 + gotMinute;
  const deltaMinutes = targetMinutes - gotMinutes;
  return new Date(probe.getTime() + deltaMinutes * 60_000 + (second - get("second")) * 1000);
}

export function resolveBandWindowUtc(
  windowDate: string,
  band: LeoTimeBand
): { start: Date; end: Date } {
  const w = LEO_TIME_BAND_WINDOWS[band];
  const start = tehranLocalToUtc(windowDate, w.startHour, 0);
  const end =
    w.endHour >= 24
      ? tehranLocalToUtc(windowDate, 23, 59, 59)
      : tehranLocalToUtc(windowDate, w.endHour, 0);
  return { start, end };
}
