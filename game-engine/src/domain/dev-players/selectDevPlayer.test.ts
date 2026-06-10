import { describe, expect, it } from "vitest";
import { pickDevPlayerForJoin } from "./selectDevPlayer.js";
import type { DevPlayerConfigSnapshot } from "./types.js";

const player = (userId: string): DevPlayerConfigSnapshot => ({
  userId,
  playWindows: [],
  minRoomPrice: null,
  maxRoomPrice: null,
  maxTicketCount: 2,
});

describe("pickDevPlayerForJoin", () => {
  it("prefers players not currently in active rooms", () => {
    const candidates = [player("a"), player("b"), player("c")];
    const occupied = new Set(["a", "b"]);
    const seen = new Set<string>();

    for (let i = 0; i < 30; i += 1) {
      const picked = pickDevPlayerForJoin(candidates, occupied);
      expect(picked?.userId).toBe("c");
      seen.add(picked!.userId);
    }

    expect(seen.size).toBe(1);
  });

  it("falls back to occupied players when everyone is in use", () => {
    const candidates = [player("a"), player("b")];
    const occupied = new Set(["a", "b"]);
    const picked = pickDevPlayerForJoin(candidates, occupied);
    expect(picked).not.toBeNull();
    expect(["a", "b"]).toContain(picked!.userId);
  });
});
