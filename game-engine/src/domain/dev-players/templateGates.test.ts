import { describe, expect, it } from "vitest";
import {
  passesDevPlayerMaxPerRoomGate,
  passesNormalPlayersPerRoomGate,
} from "./templateGates.js";

describe("passesNormalPlayersPerRoomGate", () => {
  it("allows any count when minimum is unset", () => {
    expect(passesNormalPlayersPerRoomGate(0, null)).toBe(true);
  });

  it("allows any count when minimum is zero", () => {
    expect(passesNormalPlayersPerRoomGate(0, 0)).toBe(true);
  });

  it("blocks when normal players are below minimum", () => {
    expect(passesNormalPlayersPerRoomGate(1, 2)).toBe(false);
  });

  it("allows when normal players meet minimum", () => {
    expect(passesNormalPlayersPerRoomGate(2, 2)).toBe(true);
  });
});

describe("passesDevPlayerMaxPerRoomGate", () => {
  it("allows any count when max is unset", () => {
    expect(passesDevPlayerMaxPerRoomGate(3, null)).toBe(true);
  });

  it("blocks when max is reached", () => {
    expect(passesDevPlayerMaxPerRoomGate(5, 5)).toBe(false);
  });

  it("allows when below max", () => {
    expect(passesDevPlayerMaxPerRoomGate(3, 5)).toBe(true);
  });
});
