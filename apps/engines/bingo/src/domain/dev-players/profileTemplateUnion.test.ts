import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterTemplatesByAllowedPrices,
  unionAllowedPricesFromProfiles,
} from "./profileTemplateUnion.js";
import type { RoomTemplateSnapshot } from "./types.js";

const template = (id: string, price: number): RoomTemplateSnapshot => ({
  id,
  name: id,
  price,
  vip: false,
  roomType: "normal",
  status: "active",
  maxCardsPerPlayer: 2,
  maxPlayers: null,
});

describe("profileTemplateUnion", () => {
  it("unions allowed prices from multiple profiles", () => {
    const prices = unionAllowedPricesFromProfiles([
      { allowedPrices: [1000, 2000] },
      { allowedPrices: [2000, 5000] },
    ]);

    assert.deepEqual(prices, [1000, 2000, 5000]);
  });

  it("filters templates by union of profile prices", () => {
    const templates = [
      template("a", 1000),
      template("b", 2000),
      template("c", 9000),
    ];

    const filtered = filterTemplatesByAllowedPrices(templates, [1000, 5000]);

    assert.deepEqual(
      filtered.map((item) => item.id),
      ["a"]
    );
  });
});
