import { DEV_PLAYER_PROFILE_TIME_RE, normalizeProfileTime } from "@/lib/dev-panel/devPlayerProfileValidation";
import {
  DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
  MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
  MAX_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM,
  MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
  MIN_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM,
  type TemplateRhythmWindow,
} from "@/src/types/dev-player-settings";

export const MAX_TEMPLATE_RHYTHM_WINDOWS = 8;

export type RhythmWindowSource = "window" | "default";

export type ResolvedRhythmSettings = {
  joinDelayMaxSeconds: number;
  maxDevPlayersPerRoom: number | null;
  source: RhythmWindowSource;
  windowStart?: string;
  windowEnd?: string;
};

function parseJoinDelay(value: unknown): number | null {
  const num = Number(value);
  if (
    !Number.isInteger(num) ||
    num < MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS ||
    num > MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS
  ) {
    return null;
  }
  return num;
}

function parseOptionalCap(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (
    !Number.isInteger(num) ||
    num < MIN_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM ||
    num > MAX_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM
  ) {
    return undefined;
  }
  return num;
}

function readWindowField(item: Record<string, unknown>, camel: string, snake: string): unknown {
  if (item[camel] !== undefined) return item[camel];
  return item[snake];
}

export function rhythmWindowsOverlap(a: TemplateRhythmWindow, b: TemplateRhythmWindow): boolean {
  return a.start < b.end && b.start < a.end;
}

export function findOverlappingRhythmWindows(
  windows: TemplateRhythmWindow[]
): [TemplateRhythmWindow, TemplateRhythmWindow] | null {
  for (let i = 0; i < windows.length; i += 1) {
    for (let j = i + 1; j < windows.length; j += 1) {
      if (rhythmWindowsOverlap(windows[i], windows[j])) {
        return [windows[i], windows[j]];
      }
    }
  }
  return null;
}

export function normalizeRhythmWindows(raw: unknown): TemplateRhythmWindow[] | null {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_TEMPLATE_RHYTHM_WINDOWS) return null;

  const windows: TemplateRhythmWindow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const start = normalizeProfileTime(row.start);
    const end = normalizeProfileTime(row.end);
    if (!start || !end || start >= end) return null;

    const joinDelayMaxSeconds = parseJoinDelay(
      readWindowField(row, "joinDelayMaxSeconds", "join_delay_max_seconds")
    );
    if (joinDelayMaxSeconds === null) return null;

    const maxDevPlayersPerRoom = parseOptionalCap(
      readWindowField(row, "maxDevPlayersPerRoom", "max_dev_players_per_room")
    );
    if (maxDevPlayersPerRoom === undefined) return null;

    windows.push({
      start,
      end,
      joinDelayMaxSeconds,
      maxDevPlayersPerRoom,
    });
  }

  windows.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  if (findOverlappingRhythmWindows(windows)) return null;
  return windows;
}

export function mapRhythmWindowsFromRow(raw: unknown): TemplateRhythmWindow[] {
  return normalizeRhythmWindows(raw) ?? [];
}

export function formatLocalClock(now: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function isRhythmWindowActive(
  window: Pick<TemplateRhythmWindow, "start" | "end">,
  now: Date,
  timezone: string
): boolean {
  if (!DEV_PLAYER_PROFILE_TIME_RE.test(window.start) || !DEV_PLAYER_PROFILE_TIME_RE.test(window.end)) {
    return false;
  }
  if (window.start >= window.end) return false;
  const clock = formatLocalClock(now, timezone);
  return window.start <= clock && clock < window.end;
}

export function resolveRhythmSettings(
  defaults: {
    joinDelayMaxSeconds: number;
    maxDevPlayersPerRoom: number | null;
  },
  windows: TemplateRhythmWindow[],
  now: Date,
  timezone: string
): ResolvedRhythmSettings {
  for (const window of windows) {
    if (isRhythmWindowActive(window, now, timezone)) {
      return {
        joinDelayMaxSeconds: window.joinDelayMaxSeconds,
        maxDevPlayersPerRoom: window.maxDevPlayersPerRoom,
        source: "window",
        windowStart: window.start,
        windowEnd: window.end,
      };
    }
  }
  return {
    joinDelayMaxSeconds: Number.isInteger(defaults.joinDelayMaxSeconds)
      ? defaults.joinDelayMaxSeconds
      : DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
    maxDevPlayersPerRoom: defaults.maxDevPlayersPerRoom,
    source: "default",
  };
}
