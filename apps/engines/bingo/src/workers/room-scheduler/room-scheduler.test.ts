import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const schedulerSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "index.ts"),
  "utf8"
);

const roomDomainSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../domain/room/index.ts"),
  "utf8"
);

describe("room-scheduler actor-only contract", () => {
  it("does not call manageRoomLiveActions", () => {
    assert.equal(schedulerSource.includes("manageRoomLiveActions"), false);
  });

  it("does not register room-scheduler wake listeners", () => {
    assert.equal(schedulerSource.includes("room-scheduler-wake"), false);
    assert.equal(schedulerSource.includes("registerRoomSchedulerWake"), false);
  });

  it("still promotes waiting rooms via manageWaitingRooms", () => {
    assert.equal(schedulerSource.includes("manageWaitingRooms"), true);
  });

  it("room domain no longer exports live draw scheduler path", () => {
    assert.equal(roomDomainSource.includes("manageRoomLiveActions"), false);
    assert.equal(roomDomainSource.includes("manageWaitingRooms"), true);
  });
});
