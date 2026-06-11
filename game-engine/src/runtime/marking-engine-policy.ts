/**
 * Resolves effective marking engine mode under Phase 2 safety rules:
 * - scan: production authoritative default
 * - dual: shadow validation only (bitmask never authoritative)
 * - bitmask: blocked unless MARKING_BITMASK_AUTHORITY_ALLOWED=true
 */

import type { Logger } from "../metrics/logger.js";
import type { MarkingEngineMode } from "../config/env.js";

export interface MarkingEnginePolicy {
  requested: MarkingEngineMode;
  effective: MarkingEngineMode;
  authoritative: "scan" | "bitmask";
  shadow: "bitmask" | null;
}

export function resolveMarkingEnginePolicy(
  requested: MarkingEngineMode,
  bitmaskAuthorityAllowed: boolean,
  log: Logger
): MarkingEnginePolicy {
  if (requested === "bitmask" && !bitmaskAuthorityAllowed) {
    log.warn("marking engine: bitmask authority blocked; using dual shadow", {
      requested,
      effective: "dual",
      hint: "Set MARKING_BITMASK_AUTHORITY_ALLOWED=true only after 100% parity",
    });
    return {
      requested,
      effective: "dual",
      authoritative: "scan",
      shadow: "bitmask",
    };
  }

  if (requested === "dual") {
    return {
      requested,
      effective: "dual",
      authoritative: "scan",
      shadow: "bitmask",
    };
  }

  if (requested === "bitmask") {
    return {
      requested,
      effective: "bitmask",
      authoritative: "bitmask",
      shadow: null,
    };
  }

  return {
    requested,
    effective: "scan",
    authoritative: "scan",
    shadow: null,
  };
}
