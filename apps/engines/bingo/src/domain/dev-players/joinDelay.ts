import { randomIntInclusive } from "./random.js";

export const DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS = 20;
export const MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS = 0;
export const MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS = 7200;

export function normalizeJoinDelayMaxSeconds(value: unknown): number {
  const num = Number(value);
  if (!Number.isInteger(num)) return DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS;
  if (num < MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS) return MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS;
  if (num > MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS) return MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS;
  return num;
}

/** Random delay in [0, maxSeconds] for the next join schedule to a template. */
export function rollJoinDelaySeconds(maxSeconds: number): number {
  const max = normalizeJoinDelayMaxSeconds(maxSeconds);
  return randomIntInclusive(0, max);
}

export function scheduledAtWithJoinDelay(now: Date, maxSeconds: number): string {
  const delaySeconds = rollJoinDelaySeconds(maxSeconds);
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}
