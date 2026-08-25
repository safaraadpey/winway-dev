import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideTournamentTick,
  resolveMinPlayersToStart,
  resolveRegistrationExtendEnabled,
  resolveRegistrationExtendSeconds,
} from "./tournamentEligibility.js";

const dueOpen = {
  id: "t1",
  status: "registration_open" as const,
  startAt: "2026-01-01T00:00:00.000Z",
  meta: {
    min_players_to_start: 20,
    registration_extend_minutes: 60,
    registration_extend_enabled: true,
  },
};

describe("tournamentEligibility", () => {
  it("floors min_players_to_start at 3", () => {
    assert.equal(resolveMinPlayersToStart({ min_players_to_start: 1 }), 3);
    assert.equal(resolveMinPlayersToStart({ min_players_to_start: 20 }), 20);
    assert.equal(resolveMinPlayersToStart(null), 3);
  });

  it("defaults auto-extend to true when the flag is missing", () => {
    assert.equal(resolveRegistrationExtendEnabled(null), true);
    assert.equal(resolveRegistrationExtendEnabled({}), true);
    assert.equal(
      resolveRegistrationExtendEnabled({ registration_extend_enabled: false }),
      false
    );
  });

  it("clamps extend minutes", () => {
    assert.equal(resolveRegistrationExtendSeconds(null), 3600);
    assert.equal(
      resolveRegistrationExtendSeconds({ registration_extend_minutes: 90 }),
      5400
    );
  });

  it("ticks when quorum is met", () => {
    const action = decideTournamentTick(dueOpen, Date.parse(dueOpen.startAt), 20);
    assert.deepEqual(action, { kind: "tick" });
  });

  it("defers when under quorum and auto-extend is on", () => {
    const action = decideTournamentTick(dueOpen, Date.parse(dueOpen.startAt), 19);
    assert.deepEqual(action, { kind: "defer", deferSeconds: 3600 });
  });

  it("cancels when under quorum and auto-extend is off", () => {
    const action = decideTournamentTick(
      {
        ...dueOpen,
        meta: { ...dueOpen.meta, registration_extend_enabled: false },
      },
      Date.parse(dueOpen.startAt),
      19
    );
    assert.deepEqual(action, { kind: "cancel" });
  });
});
