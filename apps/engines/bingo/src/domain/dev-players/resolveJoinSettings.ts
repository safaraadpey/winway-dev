import { DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS, normalizeJoinDelayMaxSeconds } from "./joinDelay.js";
import { isWithinPlayWindow } from "./isWithinPlayWindow.js";
import { normalizeMaxDevPlayersPerRoom } from "./templateGates.js";
import type { TemplateJoinSettingsSnapshot, TemplateRhythmWindow } from "./types.js";

export type ResolvedTemplateJoinSettings = {
  joinDelayMaxSeconds: number;
  maxDevPlayersPerRoom: number | null;
  source: "window" | "default";
  windowStart?: string;
  windowEnd?: string;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeRhythmWindow(raw: unknown): TemplateRhythmWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const start = String(row.start ?? "").trim();
  const end = String(row.end ?? "").trim();
  if (!TIME_RE.test(start) || !TIME_RE.test(end) || start >= end) return null;

  const delayRaw = row.joinDelayMaxSeconds ?? row.join_delay_max_seconds;
  const capRaw = row.maxDevPlayersPerRoom ?? row.max_dev_players_per_room;

  return {
    start,
    end,
    joinDelayMaxSeconds: normalizeJoinDelayMaxSeconds(delayRaw),
    maxDevPlayersPerRoom: normalizeMaxDevPlayersPerRoom(capRaw),
  };
}

export function normalizeRhythmWindows(raw: unknown): TemplateRhythmWindow[] {
  if (!Array.isArray(raw)) return [];
  const windows: TemplateRhythmWindow[] = [];
  for (const item of raw) {
    const window = normalizeRhythmWindow(item);
    if (window) windows.push(window);
  }
  windows.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  return windows;
}

export function resolveTemplateJoinSettings(
  snapshot: TemplateJoinSettingsSnapshot | undefined,
  now: Date,
  timezone: string
): ResolvedTemplateJoinSettings {
  const fallback: ResolvedTemplateJoinSettings = {
    joinDelayMaxSeconds: snapshot?.joinDelayMaxSeconds ?? DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
    maxDevPlayersPerRoom: snapshot?.maxDevPlayersPerRoom ?? null,
    source: "default",
  };

  for (const window of snapshot?.rhythmWindows ?? []) {
    if (isWithinPlayWindow([{ start: window.start, end: window.end }], now, timezone)) {
      return {
        joinDelayMaxSeconds: window.joinDelayMaxSeconds,
        maxDevPlayersPerRoom: window.maxDevPlayersPerRoom,
        source: "window",
        windowStart: window.start,
        windowEnd: window.end,
      };
    }
  }

  return fallback;
}
