import type { PlayWindow } from "./types.js";

/** Format `now` as HH:mm in the given IANA timezone. */
export function formatLocalTime(now: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** True when `now` falls inside any [start, end) play window (HH:mm strings). */
export function isWithinPlayWindow(
  windows: PlayWindow[],
  now: Date,
  timezone: string
): boolean {
  if (windows.length === 0) return false;
  const nowStr = formatLocalTime(now, timezone);
  return windows.some((w) => w.start < w.end && w.start <= nowStr && nowStr < w.end);
}
