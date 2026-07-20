import { randomUUID } from "node:crypto";
import type { EngineConfig } from "../config/env.js";

export interface EngineIdentity {
  /** Stable id for Redis heartbeat and logs. */
  engineId: string;
  /** Value stored in rooms.engine_owner_id — must match lease RPCs. */
  ownerId: string;
  hostname: string;
  startedAtIso: string;
}

export function createEngineIdentity(_config: EngineConfig): EngineIdentity {
  const hostname = process.env.HOSTNAME ?? process.env.RAILWAY_REPLICA_ID ?? "engine";
  const explicit = process.env.ENGINE_ID?.trim();
  const suffix = randomUUID().slice(0, 8);
  const engineId = explicit && explicit.length > 0 ? explicit : `${hostname}:${suffix}`;
  return {
    engineId,
    ownerId: engineId,
    hostname,
    startedAtIso: new Date().toISOString(),
  };
}
