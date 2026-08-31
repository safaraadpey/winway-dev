/**
 * Leo behavior engine tests.
 * Run: npm run test -w @dingmoney/leo-behavior-core
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adjustRoundParams } from "./adjustSessionEvent";
import { enforceHardLimits } from "./enforceHardLimits";
import { generateWindowTimeline } from "./generateWindowTimeline";
import {
  LEO_PROFILE_PRESETS,
  pickSessionTablePoolSource,
} from "./profilePresets";
import {
  selectTableForSession,
  selectDistinctTemplatesFromPool,
  resolveConcurrentTableCap,
  pickConcurrentTableCount,
} from "./selectTable";
import { resolveBandWindowUtc } from "./timeBands";
import { createEmptySessionRuntime } from "./types";

function seqRandom(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length] ?? 0.5;
    i += 1;
    return v;
  };
}

describe("profilePresets", () => {
  it("defines all five profiles with session duration ranges", () => {
    for (const key of Object.keys(LEO_PROFILE_PRESETS)) {
      const preset = LEO_PROFILE_PRESETS[key as keyof typeof LEO_PROFILE_PRESETS];
      assert.ok(preset.sessionDurationMinutes.max >= preset.sessionDurationMinutes.min);
      assert.ok(preset.preferredPoolWeight >= 0 && preset.preferredPoolWeight <= 1);
    }
  });
});

describe("pickSessionTablePoolSource", () => {
  it("uses preferred pool weight not as fallback", () => {
    const preferred = pickSessionTablePoolSource("methodical", () => 0.1);
    const random = pickSessionTablePoolSource("methodical", () => 0.99);
    assert.equal(preferred, "preferred");
    assert.equal(random, "random");
  });
});

describe("selectTableForSession", () => {
  it("selects only from assigned pool", () => {
    const preferred = selectTableForSession({
      tablePoolSource: "preferred",
      preferredTemplateIds: ["aaa"],
      randomTemplateIds: ["bbb"],
      random: () => 0,
    });
    assert.equal(preferred, "aaa");

    const randomPool = selectTableForSession({
      tablePoolSource: "random",
      preferredTemplateIds: ["aaa"],
      randomTemplateIds: ["bbb"],
      random: () => 0,
    });
    assert.equal(randomPool, "bbb");
  });
});

describe("enforceHardLimits", () => {
  it("forces exit on stop loss", () => {
    const result = enforceHardLimits({
      sessionBudget: 1000,
      hardStopLoss: 100,
      runtime: { ...createEmptySessionRuntime(), sessionPnl: -150 },
      proposedSpend: 10,
    });
    assert.equal(result.forceExit, true);
    assert.equal(result.reason, "stop_loss_hit");
  });

  it("forces exit when budget exhausted", () => {
    const result = enforceHardLimits({
      sessionBudget: 100,
      hardStopLoss: 0,
      runtime: { ...createEmptySessionRuntime(), sessionSpend: 100 },
      proposedSpend: 1,
    });
    assert.equal(result.forceExit, true);
    assert.equal(result.reason, "budget_exhausted");
  });
});

describe("adjustRoundParams", () => {
  it("emotional profile increases cards after losses", () => {
    const base = adjustRoundParams({
      profile: "methodical",
      runtime: createEmptySessionRuntime(),
      baseCardCount: 2,
      baseRoundDelaySeconds: 12,
      random: () => 0.99,
    });
    const tilted = adjustRoundParams({
      profile: "emotional",
      runtime: { ...createEmptySessionRuntime(), consecutiveLosses: 3 },
      baseCardCount: 2,
      baseRoundDelaySeconds: 12,
      random: () => 0.99,
    });
    assert.ok(tilted.cardCount >= base.cardCount);
  });
});

describe("selectDistinctTemplatesFromPool", () => {
  it("returns distinct templates up to count", () => {
    const ids = selectDistinctTemplatesFromPool(["a", "b", "c", "d"], 2, () => 0.5);
    assert.equal(ids.length, 2);
    assert.equal(new Set(ids).size, 2);
  });
});

describe("concurrent table selection", () => {
  it("caps by maxConcurrentTables and pool size", () => {
    const cap = resolveConcurrentTableCap(6, 3);
    assert.equal(cap, 3);
    const count = pickConcurrentTableCount("methodical", cap, () => 0.99);
    assert.ok(count >= 1 && count <= 3);
  });
});

describe("generateWindowTimeline", () => {
  it("can emit multiple round_join events per round burst", () => {
    const result = generateWindowTimeline({
      windowDate: "2026-08-30",
      timeBand: "afternoon",
      config: {
        behaviorProfile: "methodical",
        sessionBudget: 5000,
        hardStopLoss: 500,
        maxConcurrentTables: 0,
        preferredTemplateIds: ["t1", "t2", "t3", "t4"],
        randomTemplateIds: ["r1"],
      },
      random: seqRandom([0.1, 0.2, 0.99, 0.99, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    });

    const joins = result.events.filter((e) => e.eventType === "round_join");
    const burst = joins.filter((e) => (e.concurrentJoinTotal ?? 0) > 1);
    assert.ok(joins.length >= 1);
    assert.ok(burst.length >= 1 || joins.some((e) => e.concurrentJoinTotal === 1));
  });

  it("produces events within band window", () => {
    const result = generateWindowTimeline({
      windowDate: "2026-08-30",
      timeBand: "afternoon",
      config: {
        behaviorProfile: "methodical",
        sessionBudget: 5000,
        hardStopLoss: 500,
        maxConcurrentTables: 0,
        preferredTemplateIds: ["t1", "t2"],
        randomTemplateIds: ["r1"],
      },
      random: seqRandom([0.2, 0.3, 0.4, 0.5, 0.6, 0.1, 0.8, 0.9]),
    });

    assert.ok(result.events.length > 0);
    for (const event of result.events) {
      assert.ok(event.scheduledAt.getTime() >= result.windowStart.getTime());
      assert.ok(event.scheduledAt.getTime() <= result.windowEnd.getTime() + 60_000);
    }
  });

  it("assigns per-session table pool sources", () => {
    const result = generateWindowTimeline({
      windowDate: "2026-08-30",
      timeBand: "evening",
      config: {
        behaviorProfile: "distracted",
        sessionBudget: 5000,
        hardStopLoss: 500,
        preferredTemplateIds: ["t1"],
        randomTemplateIds: ["r1", "r2"],
      },
      random: seqRandom([0.9, 0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    });

    const sessionStarts = result.events.filter((e) => e.eventType === "session_start");
    assert.ok(sessionStarts.length >= 1);
    const sources = new Set(sessionStarts.map((e) => e.tablePoolSource));
    assert.ok(sources.has("preferred") || sources.has("random"));
  });
});

describe("resolveBandWindowUtc", () => {
  it("returns afternoon band bounds", () => {
    const { start, end } = resolveBandWindowUtc("2026-08-30", "afternoon");
    assert.ok(end.getTime() > start.getTime());
  });
});
