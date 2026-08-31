import { adjustRoundParams } from "./adjustSessionEvent";
import { getProfilePreset, pickSessionTablePoolSource } from "./profilePresets";
import { defaultRandom, randomFloat, randomInt } from "./random";
import { selectConcurrentTablesForRound } from "./selectTable";
import { resolveBandWindowUtc } from "./timeBands";
import type {
  GenerateWindowTimelineInput,
  GenerateWindowTimelineResult,
  LeoTimelineEvent,
  LeoTimelineEventType,
} from "./types";
import { createEmptySessionRuntime } from "./types";

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function pushEvent(
  events: LeoTimelineEvent[],
  sequence: number,
  eventType: LeoTimelineEventType,
  scheduledAt: Date,
  sessionIndex: number,
  extra?: Partial<LeoTimelineEvent>
): number {
  events.push({
    sequence,
    eventType,
    scheduledAt,
    sessionIndex,
    ...extra,
  });
  return sequence + 1;
}

/**
 * Generates a natural, variable execution timeline for one active time band.
 * Each session independently picks preferred or random table pool.
 */
export function generateWindowTimeline(
  input: GenerateWindowTimelineInput
): GenerateWindowTimelineResult {
  const random = input.random ?? defaultRandom;
  const { windowDate, timeBand, config } = input;
  const preset = getProfilePreset(config.behaviorProfile);
  const { start: windowStart, end: windowEnd } = resolveBandWindowUtc(windowDate, timeBand);

  const windowMs = windowEnd.getTime() - windowStart.getTime();
  const entryOffsetMinutes = randomInt(5, Math.max(10, Math.floor(windowMs / 60_000 / 4)), random);
  let cursor = addMinutes(windowStart, entryOffsetMinutes);

  const events: LeoTimelineEvent[] = [];
  let sequence = 0;
  const sessionCount = randomInt(preset.sessionCount.min, preset.sessionCount.max, random);

  sequence = pushEvent(events, sequence, "enter", cursor, -1, {
    label: "ورود",
  });

  let runtime = createEmptySessionRuntime();

  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex++) {
    if (cursor.getTime() >= windowEnd.getTime()) break;

    const tablePoolSource = pickSessionTablePoolSource(config.behaviorProfile, random);
    const sessionDurationMinutes = randomInt(
      preset.sessionDurationMinutes.min,
      preset.sessionDurationMinutes.max,
      random
    );

    sequence = pushEvent(events, sequence, "session_start", cursor, sessionIndex, {
      tablePoolSource,
      label: tablePoolSource === "preferred" ? "شروع سشن — pool همیشگی" : "شروع سشن — pool تصادفی",
    });

    const sessionEnd = addMinutes(cursor, sessionDurationMinutes);
    let roundCursor = new Date(cursor.getTime());

    while (roundCursor.getTime() < sessionEnd.getTime() && roundCursor.getTime() < windowEnd.getTime()) {
      const baseCardCount = randomInt(preset.baseCardCount.min, preset.baseCardCount.max, random);
      const baseDelay = randomFloat(
        preset.roundDelaySeconds.min,
        preset.roundDelaySeconds.max,
        random
      );

      const adjusted = adjustRoundParams({
        profile: config.behaviorProfile,
        runtime,
        baseCardCount,
        baseRoundDelaySeconds: baseDelay,
        random,
      });

      runtime = {
        ...runtime,
        roundsPlayed: runtime.roundsPlayed + 1,
        fatigue: runtime.fatigue + preset.fatiguePerRound,
        inTilt: config.behaviorProfile === "emotional" && runtime.consecutiveLosses >= 2,
        inHotStreak: config.behaviorProfile === "hot_hand" && runtime.consecutiveWins >= 1,
      };

      if (adjusted.earlyExit || adjusted.rageQuit) {
        sequence = pushEvent(events, sequence, "exit", roundCursor, sessionIndex, {
          label: adjusted.rageQuit ? "خروج زودهنگام (tilt)" : "خروج زودهنگام",
        });
        cursor = roundCursor;
        break;
      }

      if (adjusted.skipRound) {
        sequence = pushEvent(events, sequence, "skip", roundCursor, sessionIndex, {
          label: "رد دست",
        });
      } else {
        const { templateIds, tableCount } = selectConcurrentTablesForRound({
          tablePoolSource,
          preferredTemplateIds: config.preferredTemplateIds,
          randomTemplateIds: config.randomTemplateIds,
          behaviorProfile: config.behaviorProfile,
          maxConcurrentTables: config.maxConcurrentTables ?? 0,
          random,
        });

        const staggerSeconds = randomInt(
          preset.staggerJoinSeconds.min,
          preset.staggerJoinSeconds.max,
          random
        );

        for (let joinIndex = 0; joinIndex < templateIds.length; joinIndex++) {
          const templateId = templateIds[joinIndex];
          const joinAt = addSeconds(roundCursor, joinIndex * staggerSeconds);
          sequence = pushEvent(events, sequence, "round_join", joinAt, sessionIndex, {
            tablePoolSource,
            templateId,
            cardCount: adjusted.cardCount,
            roundDelaySeconds: adjusted.roundDelaySeconds,
            concurrentJoinIndex: joinIndex + 1,
            concurrentJoinTotal: tableCount,
            label:
              tableCount > 1
                ? `پیوستن به میز ${joinIndex + 1}/${tableCount}`
                : "پیوستن به دست",
          });
        }
      }

      roundCursor = addSeconds(roundCursor, adjusted.roundDelaySeconds + randomInt(30, 180, random));
    }

    cursor = sessionEnd.getTime() > windowEnd.getTime() ? windowEnd : sessionEnd;

    if (sessionIndex < sessionCount - 1 && cursor.getTime() < windowEnd.getTime()) {
      const breakMinutes = randomInt(
        preset.breakDurationMinutes.min,
        preset.breakDurationMinutes.max,
        random
      );
      const breakAt = addMinutes(cursor, 0);
      sequence = pushEvent(events, sequence, "break", breakAt, sessionIndex, {
        label: `استراحت ${breakMinutes} دقیقه`,
      });
      cursor = addMinutes(cursor, breakMinutes);
      runtime = createEmptySessionRuntime();
    }
  }

  if (events.every((e) => e.eventType !== "exit")) {
    const exitAt = cursor.getTime() > windowEnd.getTime() ? windowEnd : cursor;
    sequence = pushEvent(events, sequence, "exit", exitAt, sessionCount - 1, {
      label: "خروج",
    });
  }

  return { events, windowStart, windowEnd };
}
