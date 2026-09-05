import { getPgPool } from "../db/pg.js";
import type { GameRepo } from "../repositories/index.js";
import type { LegacyDrawGateSnapshot } from "./legacyWorkerGate.js";

/** Classify post-settlement bulk-history draw_jobs on finished manifest_ram rooms. */
export async function enrichLegacyDrawGateSnapshot(
  repo: GameRepo,
  base?: LegacyDrawGateSnapshot
): Promise<LegacyDrawGateSnapshot> {
  const snapshot = base ?? (await repo.fetchLegacyDrawProcessorGateSnapshot());
  const pg = getPgPool();
  if (!pg) return snapshot;

  try {
    const res = await pg.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
       FROM public.draw_jobs dj
       INNER JOIN public.rooms r ON r.id = dj.room_id
       WHERE dj.status IN ('queued', 'processing', 'failed')
         AND r.status IN ('finished', 'cancelled')
         AND r.gameplay_persist_mode = 'manifest_ram'`
    );
    return {
      ...snapshot,
      terminalManifestRamDrawJobsPending: res.rows[0]?.n ?? 0,
    };
  } catch {
    return snapshot;
  }
}
