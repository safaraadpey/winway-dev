import type { DevPlayerSettingsSnapshot } from "./types.js";
import { randomIntInclusive } from "./random.js";

export const MIN_CYCLE_RANDOM_SECONDS = 50;
export const MIN_JOIN_DELAY_SECONDS = 5;

export type SchedulerCyclePhase = "work" | "pause";

export interface SchedulerRuntimeState {
  cyclePhase: SchedulerCyclePhase;
  cyclePhaseEndsAt: string | null;
  nextJoinAtByTemplate: Record<string, string>;
  joinsInWorkCycleByTemplate: Record<string, number>;
}

export function mapJoinsInWorkCycleByTemplate(raw: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return counts;
  for (const [templateId, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) counts[templateId] = Math.floor(n);
  }
  return counts;
}

/** When pause cycle is configured, cap joins per template per work phase. */
export function canScheduleWorkCycleJoin(
  pauseCycleConfigured: boolean,
  joinsCompleted: number,
  joinsPerWorkCycle: number
): boolean {
  if (!pauseCycleConfigured) return true;
  const budget = Math.max(1, Math.floor(joinsPerWorkCycle));
  return joinsCompleted < budget;
}

export function isPauseCycleConfigured(settings: DevPlayerSettingsSnapshot): boolean {
  return (
    settings.schedulerPauseAfterSeconds !== null &&
    settings.schedulerPauseDurationSeconds !== null &&
    settings.schedulerPauseAfterSeconds > 0 &&
    settings.schedulerPauseDurationSeconds > 0
  );
}

export function rollWorkDurationSeconds(pauseAfterSeconds: number): number {
  return randomIntInclusive(MIN_CYCLE_RANDOM_SECONDS, Math.max(MIN_CYCLE_RANDOM_SECONDS, pauseAfterSeconds));
}

export function rollPauseDurationSeconds(pauseDurationSeconds: number): number {
  return randomIntInclusive(
    MIN_CYCLE_RANDOM_SECONDS,
    Math.max(MIN_CYCLE_RANDOM_SECONDS, pauseDurationSeconds)
  );
}

export function rollJoinDelaySeconds(joinIntervalSeconds: number): number {
  const upperBound = Math.max(MIN_JOIN_DELAY_SECONDS, joinIntervalSeconds);
  return randomIntInclusive(MIN_JOIN_DELAY_SECONDS, upperBound);
}

export function rollTicketCount(
  maxTicketCount: number,
  templateMaxCardsPerPlayer?: number | null
): number {
  const playerMax = Math.max(1, Math.floor(maxTicketCount));
  const templateMax =
    templateMaxCardsPerPlayer != null &&
    Number.isFinite(templateMaxCardsPerPlayer) &&
    templateMaxCardsPerPlayer > 0
      ? Math.floor(templateMaxCardsPerPlayer)
      : playerMax;
  const upperBound = Math.max(1, Math.min(playerMax, templateMax));
  return randomIntInclusive(1, upperBound);
}

export function isJoinDue(
  templateId: string,
  nextJoinAtByTemplate: Record<string, string>,
  now: Date
): boolean {
  const nextAt = nextJoinAtByTemplate[templateId];
  if (!nextAt) return true;
  return now.getTime() >= new Date(nextAt).getTime();
}

export function advanceSchedulerCycle(
  settings: DevPlayerSettingsSnapshot,
  runtime: SchedulerRuntimeState,
  now: Date
): { runtime: SchedulerRuntimeState; inPause: boolean; transitioned: boolean } {
  if (!isPauseCycleConfigured(settings)) {
    return {
      runtime: {
        ...runtime,
        cyclePhase: "work",
        joinsInWorkCycleByTemplate: runtime.joinsInWorkCycleByTemplate ?? {},
      },
      inPause: false,
      transitioned: false,
    };
  }

  const pauseAfter = settings.schedulerPauseAfterSeconds!;
  const pauseDuration = settings.schedulerPauseDurationSeconds!;
  let { cyclePhase, cyclePhaseEndsAt } = runtime;
  let transitioned = false;

  const endsAtMs = cyclePhaseEndsAt ? new Date(cyclePhaseEndsAt).getTime() : null;
  const shouldTransition = endsAtMs === null || now.getTime() >= endsAtMs;

  if (shouldTransition) {
    transitioned = true;
    if (endsAtMs === null) {
      const workSeconds = rollWorkDurationSeconds(pauseAfter);
      cyclePhase = "work";
      cyclePhaseEndsAt = new Date(now.getTime() + workSeconds * 1000).toISOString();
    } else if (cyclePhase === "work") {
      const pauseSeconds = rollPauseDurationSeconds(pauseDuration);
      cyclePhase = "pause";
      cyclePhaseEndsAt = new Date(now.getTime() + pauseSeconds * 1000).toISOString();
    } else {
      const workSeconds = rollWorkDurationSeconds(pauseAfter);
      cyclePhase = "work";
      cyclePhaseEndsAt = new Date(now.getTime() + workSeconds * 1000).toISOString();
    }
  }

  const inPause = cyclePhase === "pause";
  const startedWorkPhase = transitioned && cyclePhase === "work";
  return {
    runtime: {
      ...runtime,
      cyclePhase,
      cyclePhaseEndsAt,
      joinsInWorkCycleByTemplate: startedWorkPhase
        ? {}
        : (runtime.joinsInWorkCycleByTemplate ?? {}),
    },
    inPause,
    transitioned,
  };
}
