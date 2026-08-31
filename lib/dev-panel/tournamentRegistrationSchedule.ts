/**
 * Human-like tournament registration schedule: exponential decay × circadian rhythm + jitter.
 * Window spans registration open → tournament start (multi-day when start is far away).
 */

export const HOURLY_CIRCADIAN: Record<number, number> = {
  0: 0.2,
  1: 0.1,
  2: 0.05,
  3: 0.02,
  4: 0.01,
  5: 0.02,
  6: 0.05,
  7: 0.1,
  8: 0.2,
  9: 0.3,
  10: 0.4,
  11: 0.5,
  12: 0.6,
  13: 0.5,
  14: 0.4,
  15: 0.4,
  16: 0.5,
  17: 0.7,
  18: 0.9,
  19: 1.0,
  20: 1.0,
  21: 0.95,
  22: 0.7,
  23: 0.4,
};

export const SCHEDULE_TIMEZONE = "Asia/Tehran";
/** Used only when tournament start_at is missing or not after registration open. */
export const DEFAULT_FALLBACK_WINDOW_HOURS = 24;
export const DECAY_LAMBDA = 0.15;
export const DECAY_FLOOR = 0.2;

export type RegistrationScheduleItem = {
  userId: string;
  scheduledAt: Date;
};

export type GenerateRegistrationScheduleInput = {
  registrationOpenTime: Date;
  playerIds: string[];
  tournamentStartAt?: Date | null;
  /** Injectable RNG in [0, 1) for tests */
  random?: () => number;
};

export type ScheduleWindow = {
  windowEnd: Date;
  windowHours: number;
  windowMs: number;
};

function defaultRandom(): number {
  return Math.random();
}

/** Local hour 0–23 in Asia/Tehran for a UTC instant. */
export function getTehranHour(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIMEZONE,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  return Number(hourPart?.value ?? 0);
}

/**
 * Registration cycle runs from open until tournament start (or 24h fallback).
 */
export function resolveScheduleWindow(
  registrationOpenTime: Date,
  tournamentStartAt?: Date | null
): ScheduleWindow {
  const openMs = registrationOpenTime.getTime();
  const fallbackEndMs = openMs + DEFAULT_FALLBACK_WINDOW_HOURS * 60 * 60 * 1000;

  let windowEndMs = fallbackEndMs;
  if (tournamentStartAt) {
    const startMs = tournamentStartAt.getTime();
    if (startMs > openMs) {
      windowEndMs = startMs;
    }
  }

  const windowMs = Math.max(windowEndMs - openMs, 60 * 60 * 1000);
  const windowHours = Math.max(1, Math.ceil(windowMs / (60 * 60 * 1000)));

  return {
    windowEnd: new Date(openMs + windowMs),
    windowHours,
    windowMs,
  };
}

export function formatScheduleWindowDuration(windowMs: number): string {
  const totalHours = Math.max(1, Math.round(windowMs / (60 * 60 * 1000)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0 && hours > 0) {
    return `${days} روز و ${hours} ساعت`;
  }
  if (days > 0) {
    return `${days} روز`;
  }
  return `${hours} ساعت`;
}

export function computeHourlyWeights(
  registrationOpenTime: Date,
  windowHours: number
): Array<{ offset: number; weight: number }> {
  const weights: Array<{ offset: number; weight: number }> = [];
  const hours = Math.max(1, windowHours);

  for (let hoursOffset = 0; hoursOffset < hours; hoursOffset += 1) {
    const currentDt = new Date(registrationOpenTime.getTime() + hoursOffset * 60 * 60 * 1000);
    const circadian = HOURLY_CIRCADIAN[getTehranHour(currentDt)] ?? 0.4;
    const decayFactor = Math.exp(-DECAY_LAMBDA * hoursOffset) + DECAY_FLOOR;
    weights.push({ offset: hoursOffset, weight: circadian * decayFactor });
  }

  return weights;
}

function pickHourOffset(
  hourlyWeights: Array<{ offset: number; weight: number }>,
  randVal: number
): number {
  const totalWeight = hourlyWeights.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) return 0;

  let cumulative = 0;
  for (const { offset, weight } of hourlyWeights) {
    cumulative += weight;
    if (randVal <= cumulative) return offset;
  }
  return hourlyWeights[hourlyWeights.length - 1]?.offset ?? 0;
}

function randomIntInclusive(max: number, random: () => number): number {
  if (max <= 0) return 0;
  return Math.floor(random() * (max + 1));
}

function clampTimestamp(
  dt: Date,
  registrationOpenTime: Date,
  windowEnd: Date
): Date {
  const openMs = registrationOpenTime.getTime();
  const endMs = windowEnd.getTime();
  const ms = Math.min(Math.max(dt.getTime(), openMs), endMs - 1);
  return new Date(ms);
}

/**
 * Build sorted registration timestamps for each player id.
 */
export function generateRegistrationSchedule(
  input: GenerateRegistrationScheduleInput
): RegistrationScheduleItem[] {
  const { registrationOpenTime, playerIds, tournamentStartAt } = input;
  const random = input.random ?? defaultRandom;

  if (playerIds.length === 0) return [];

  const { windowEnd, windowHours } = resolveScheduleWindow(
    registrationOpenTime,
    tournamentStartAt
  );

  const hourlyWeights = computeHourlyWeights(registrationOpenTime, windowHours);
  const totalWeight = hourlyWeights.reduce((sum, row) => sum + row.weight, 0);

  const items: RegistrationScheduleItem[] = [];

  for (const userId of playerIds) {
    const randVal = random() * totalWeight;
    const selectedOffset = pickHourOffset(hourlyWeights, randVal);

    const baseTime = new Date(
      registrationOpenTime.getTime() + selectedOffset * 60 * 60 * 1000
    );

    const withJitter = new Date(
      baseTime.getTime() +
        randomIntInclusive(59, random) * 60 * 1000 +
        randomIntInclusive(59, random) * 1000 +
        randomIntInclusive(999, random)
    );

    items.push({
      userId,
      scheduledAt: clampTimestamp(withJitter, registrationOpenTime, windowEnd),
    });
  }

  items.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  return items;
}
