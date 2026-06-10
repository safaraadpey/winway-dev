import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWithinPlayWindow } from "./isWithinPlayWindow.js";

describe("isWithinPlayWindow", () => {
  it("returns true inside a window", () => {
    const ok = isWithinPlayWindow(
      [{ start: "10:00", end: "22:00" }],
      new Date("2026-01-15T12:00:00+03:30"),
      "Asia/Tehran"
    );
    assert.equal(ok, true);
  });

  it("returns false outside all windows", () => {
    const ok = isWithinPlayWindow(
      [{ start: "10:00", end: "12:00" }],
      new Date("2026-01-15T08:00:00+03:30"),
      "Asia/Tehran"
    );
    assert.equal(ok, false);
  });

  it("returns false for empty windows", () => {
    assert.equal(isWithinPlayWindow([], new Date(), "Asia/Tehran"), false);
  });
});
