import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeMaxDevPlayersPerRoom,
  passesDevPlayerMaxPerRoomGate,
  passesNormalPlayersPerRoomGate,
} from "./templateGates.js";

describe("passesNormalPlayersPerRoomGate", () => {
  it("allows any count when minimum is unset", () => {
    assert.equal(passesNormalPlayersPerRoomGate(0, null), true);
  });

  it("allows any count when minimum is zero", () => {
    assert.equal(passesNormalPlayersPerRoomGate(0, 0), true);
  });

  it("blocks when normal players are below minimum", () => {
    assert.equal(passesNormalPlayersPerRoomGate(1, 2), false);
  });

  it("allows when normal players meet minimum", () => {
    assert.equal(passesNormalPlayersPerRoomGate(2, 2), true);
  });
});

describe("normalizeMaxDevPlayersPerRoom", () => {
  it("treats empty values as unlimited", () => {
    assert.equal(normalizeMaxDevPlayersPerRoom(null), null);
    assert.equal(normalizeMaxDevPlayersPerRoom(undefined), null);
    assert.equal(normalizeMaxDevPlayersPerRoom(""), null);
  });

  it("clamps out-of-range integers", () => {
    assert.equal(normalizeMaxDevPlayersPerRoom(-1), 0);
    assert.equal(normalizeMaxDevPlayersPerRoom(120), 99);
  });
});

describe("passesDevPlayerMaxPerRoomGate", () => {
  it("allows any count when max is unset", () => {
    assert.equal(passesDevPlayerMaxPerRoomGate(3, null), true);
  });

  it("blocks when max is reached", () => {
    assert.equal(passesDevPlayerMaxPerRoomGate(5, 5), false);
  });

  it("allows when below max", () => {
    assert.equal(passesDevPlayerMaxPerRoomGate(3, 5), true);
  });

  it("blocks all joins when max is zero", () => {
    assert.equal(passesDevPlayerMaxPerRoomGate(0, 0), false);
  });
});
