import {
  buildDrawVerificationSpec,
  type DrawVerificationSpec,
} from "@/lib/provablyFairDrawSpec";
import { pgPool } from "@/lib/pg";
import { assertWatchFinishedRoomAccess } from "@/lib/watch-invite/assertWatchFinishedRoomAccess";

type Winner = {
  id: string;
  avatarUrl: string;
  nickname: string;
  prizeAmount: number;
  ticketId?: string;
  drawNumber?: number;
};

export type WatchRoomResultsPayload = {
  lineWinners: Winner[];
  fullWinners: Winner[];
  seed: string | null;
  commitHash: string | null;
  drawVerification: DrawVerificationSpec | null;
  isTournament: boolean;
  tournamentId: string | null;
};

type ResultRow = {
  user_id: string;
  win_type: string;
  reward_amount: string | number;
  ticket_id: string | null;
  draw_number: number | null;
};

export async function loadWatchRoomResults(
  watchCode: number,
  roomId: string
): Promise<WatchRoomResultsPayload | null> {
  const access = await assertWatchFinishedRoomAccess(watchCode, roomId);
  if (!access || !pgPool) return null;

  const { rows: resultRows } = await pgPool.query<ResultRow>(
    `SELECT user_id, win_type::text AS win_type, reward_amount, ticket_id, draw_number
       FROM public.results
      WHERE room_id = $1::uuid
      ORDER BY draw_number NULLS LAST, created_at ASC`,
    [roomId]
  );

  const winnerIds = Array.from(new Set(resultRows.map((r) => r.user_id).filter(Boolean))).sort();
  const winnerLabelByUserId = new Map<string, string>();
  winnerIds.forEach((id, index) => {
    winnerLabelByUserId.set(id, `برنده ${(index + 1).toLocaleString("fa-IR")}`);
  });

  const mapWinner = (r: ResultRow): Winner => ({
    id: r.user_id,
    avatarUrl: "",
    nickname: winnerLabelByUserId.get(r.user_id) || "برنده",
    prizeAmount: Number(r.reward_amount || 0),
    ticketId: r.ticket_id || undefined,
    drawNumber: r.draw_number ?? undefined,
  });

  const lineWinners = resultRows.filter((r) => r.win_type === "line").map(mapWinner);
  const fullWinners = resultRows.filter((r) => r.win_type === "full").map(mapWinner);

  const { rows: roomRows } = await pgPool.query<{
    room_seed_hex: string | null;
    room_seed_hash: string | null;
    room_type: string | null;
  }>(
    `SELECT
       CASE WHEN r.room_seed IS NULL THEN NULL ELSE encode(r.room_seed, 'hex') END AS room_seed_hex,
       r.room_seed_hash,
       rt.room_type::text AS room_type
     FROM public.rooms r
     LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE r.id = $1::uuid
    LIMIT 1`,
    [roomId]
  );

  const roomRow = roomRows[0];
  const seed = roomRow?.room_seed_hex ?? null;
  const commitHash = roomRow?.room_seed_hash ?? null;
  const isTournament = roomRow?.room_type === "tournament";

  const { rows: drawRows } = await pgPool.query<{ number: number }>(
    `SELECT number
       FROM public.draws
      WHERE room_id = $1::uuid
        AND processed_at IS NOT NULL
      ORDER BY processed_at ASC`,
    [roomId]
  );

  const drawnNumbers = drawRows
    .map((d) => Number(d.number))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 90);

  const drawVerification = buildDrawVerificationSpec({
    roomId,
    serverSeedRaw: seed,
    serverSeedHash: commitHash,
    drawnNumbers,
  });

  return {
    lineWinners,
    fullWinners,
    seed,
    commitHash,
    drawVerification,
    isTournament,
    tournamentId: access.tournamentId,
  };
}
