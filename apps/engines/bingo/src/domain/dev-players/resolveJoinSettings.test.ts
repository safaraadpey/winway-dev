import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveTemplateJoinSettings } from "./resolveJoinSettings.js";
import type { TemplateJoinSettingsSnapshot } from "./types.js";

const TIMEZONE = "Asia/Tehran";

function snapshot(partial: Partial<TemplateJoinSettingsSnapshot> = {}): TemplateJoinSettingsSnapshot {
  return {
    joinDelayMaxSeconds: 200,
    maxDevPlayersPerRoom: 4,
    rhythmWindows: [],
    ...partial,
  };
}

describe("resolveTemplateJoinSettings", () => {
  it("uses row defaults when no windows exist", () => {
    const resolved = resolveTemplateJoinSettings(
      snapshot(),
      new Date("2026-09-05T08:00:00+03:30"),
      TIMEZONE
    );
    assert.equal(resolved.source, "default");
    assert.equal(resolved.joinDelayMaxSeconds, 200);
    assert.equal(resolved.maxDevPlayersPerRoom, 4);
  });

  it("uses row defaults when now is outside every window", () => {
    const resolved = resolveTemplateJoinSettings(
      snapshot({
        rhythmWindows: [
          { start: "06:00", end: "12:00", joinDelayMaxSeconds: 300, maxDevPlayersPerRoom: 1 },
          { start: "17:00", end: "23:00", joinDelayMaxSeconds: 20, maxDevPlayersPerRoom: null },
        ],
      }),
      new Date("2026-09-05T14:00:00+03:30"),
      TIMEZONE
    );
    assert.equal(resolved.source, "default");
    assert.equal(resolved.joinDelayMaxSeconds, 200);
    assert.equal(resolved.maxDevPlayersPerRoom, 4);
  });

  it("applies the morning window when now is inside it", () => {
    const resolved = resolveTemplateJoinSettings(
      snapshot({
        rhythmWindows: [
          { start: "06:00", end: "12:00", joinDelayMaxSeconds: 300, maxDevPlayersPerRoom: 1 },
          { start: "17:00", end: "23:00", joinDelayMaxSeconds: 20, maxDevPlayersPerRoom: null },
        ],
      }),
      new Date("2026-09-05T08:30:00+03:30"),
      TIMEZONE
    );
    assert.equal(resolved.source, "window");
    assert.equal(resolved.windowStart, "06:00");
    assert.equal(resolved.windowEnd, "12:00");
    assert.equal(resolved.joinDelayMaxSeconds, 300);
    assert.equal(resolved.maxDevPlayersPerRoom, 1);
  });

  it("applies the evening window when now is inside it", () => {
    const resolved = resolveTemplateJoinSettings(
      snapshot({
        rhythmWindows: [
          { start: "06:00", end: "12:00", joinDelayMaxSeconds: 300, maxDevPlayersPerRoom: 1 },
          { start: "17:00", end: "23:00", joinDelayMaxSeconds: 20, maxDevPlayersPerRoom: null },
        ],
      }),
      new Date("2026-09-05T19:00:00+03:30"),
      TIMEZONE
    );
    assert.equal(resolved.source, "window");
    assert.equal(resolved.windowStart, "17:00");
    assert.equal(resolved.joinDelayMaxSeconds, 20);
    assert.equal(resolved.maxDevPlayersPerRoom, null);
  });

  it("falls back to engine defaults when snapshot is missing", () => {
    const resolved = resolveTemplateJoinSettings(
      undefined,
      new Date("2026-09-05T19:00:00+03:30"),
      TIMEZONE
    );
    assert.equal(resolved.source, "default");
    assert.equal(resolved.joinDelayMaxSeconds, 20);
    assert.equal(resolved.maxDevPlayersPerRoom, null);
  });
});
