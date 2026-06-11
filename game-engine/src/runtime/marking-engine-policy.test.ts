import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLogger } from "../metrics/logger.js";
import { resolveMarkingEnginePolicy } from "./marking-engine-policy.js";

const log = createLogger("error");

describe("resolveMarkingEnginePolicy", () => {
  it("keeps scan as authoritative", () => {
    const p = resolveMarkingEnginePolicy("scan", false, log);
    assert.equal(p.effective, "scan");
    assert.equal(p.authoritative, "scan");
    assert.equal(p.shadow, null);
  });

  it("dual runs bitmask shadow only", () => {
    const p = resolveMarkingEnginePolicy("dual", false, log);
    assert.equal(p.effective, "dual");
    assert.equal(p.authoritative, "scan");
    assert.equal(p.shadow, "bitmask");
  });

  it("blocks bitmask authority unless explicitly allowed", () => {
    const p = resolveMarkingEnginePolicy("bitmask", false, log);
    assert.equal(p.effective, "dual");
    assert.equal(p.authoritative, "scan");
    assert.equal(p.shadow, "bitmask");
  });

  it("allows bitmask authority when flag set (post-parity cutover)", () => {
    const p = resolveMarkingEnginePolicy("bitmask", true, log);
    assert.equal(p.effective, "bitmask");
    assert.equal(p.authoritative, "bitmask");
    assert.equal(p.shadow, null);
  });
});
