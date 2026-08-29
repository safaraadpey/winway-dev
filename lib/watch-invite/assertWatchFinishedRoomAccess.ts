import { pgPool } from "@/lib/pg";
import { getTournamentByWatchCode } from "@/lib/watch-invite/repository";

const FINISHED_ROOM_STATUSES = new Set(["finished", "settling", "settled"]);

function requirePool() {
  if (!pgPool) {
    throw new Error("DATABASE_URL / pgPool unavailable");
  }
  return pgPool;
}

export async function assertWatchFinishedRoomAccess(
  watchCode: number,
  roomId: string
): Promise<{ tournamentId: string; roomStatus: string } | null> {
  const tournament = await getTournamentByWatchCode(watchCode);
  if (!tournament) return null;

  const pool = requirePool();
  const { rows } = await pool.query<{ tournament_id: string; room_status: string | null }>(
    `SELECT trr.tournament_id, r.status AS room_status
       FROM public.tournament_round_rooms trr
       JOIN public.rooms r ON r.id = trr.room_id
      WHERE trr.tournament_id = $1
        AND trr.room_id = $2
      LIMIT 1`,
    [tournament.id, roomId]
  );

  const row = rows[0];
  if (!row) return null;

  const roomStatus = (row.room_status || "").toLowerCase();
  if (!FINISHED_ROOM_STATUSES.has(roomStatus)) {
    return null;
  }

  return { tournamentId: row.tournament_id, roomStatus };
}
