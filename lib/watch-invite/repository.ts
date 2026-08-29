import { pgPool } from "@/lib/pg";
import { generateWatchInviteToken } from "@/lib/watch-invite/guestCookie";
import type {
  WatchInviteBanner,
  WatchInviteBannerMetaOverride,
  WatchTournamentSnapshot,
  WatchTournamentTable,
} from "@/lib/watch-invite/types";
import { mergeWatchInviteBanner } from "@/lib/watch-invite/bannerOverride";

function requirePool() {
  if (!pgPool) {
    throw new Error("DATABASE_URL / pgPool unavailable");
  }
  return pgPool;
}

export async function getTournamentByWatchCode(watchCode: number) {
  const pool = requirePool();
  const { rows } = await pool.query<{
    id: string;
    title: string;
    status: string;
    start_at: string | null;
    ticket_price: string;
    guaranteed_prize: string;
    commission_rate: string | null;
    currency: string;
    min_tickets_per_player: number;
    max_tickets_per_player: number;
    table_size_mode: string | null;
    table_size_fixed: number | null;
    table_size_min: number | null;
    table_size_max: number | null;
    later_round_table_size_mode: string | null;
    later_round_table_size_fixed: number | null;
    later_round_table_size_min: number | null;
    later_round_table_size_max: number | null;
    meta: Record<string, unknown> | null;
    watch_code: number;
  }>(
    `SELECT id, title, status, start_at, ticket_price, guaranteed_prize, commission_rate,
            currency, min_tickets_per_player, max_tickets_per_player,
            table_size_mode, table_size_fixed, table_size_min, table_size_max,
            later_round_table_size_mode, later_round_table_size_fixed,
            later_round_table_size_min, later_round_table_size_max,
            meta, watch_code
       FROM public.tournaments
      WHERE watch_code = $1
      LIMIT 1`,
    [watchCode]
  );
  return rows[0] ?? null;
}

export async function getInviteTokenRow(token: string) {
  const pool = requirePool();
  const { rows } = await pool.query<{ user_id: string; token: string }>(
    `SELECT user_id, token
       FROM public.player_watch_invite_tokens
      WHERE token = $1
      LIMIT 1`,
    [token]
  );
  return rows[0] ?? null;
}

export async function getOrCreateInviteTokenForUser(userId: string): Promise<string> {
  const pool = requirePool();
  const existing = await pool.query<{ token: string }>(
    `SELECT token FROM public.player_watch_invite_tokens WHERE user_id = $1`,
    [userId]
  );
  if (existing.rows[0]?.token) {
    return existing.rows[0].token;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = generateWatchInviteToken();
    try {
      await pool.query(
        `INSERT INTO public.player_watch_invite_tokens (user_id, token)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, token]
      );
      const after = await pool.query<{ token: string }>(
        `SELECT token FROM public.player_watch_invite_tokens WHERE user_id = $1`,
        [userId]
      );
      if (after.rows[0]?.token) return after.rows[0].token;
    } catch {
      // collision on token unique — retry
    }
  }
  throw new Error("failed to allocate invite token");
}

export async function resolveSignupReferralCodeForUser(userId: string): Promise<string | null> {
  const pool = requirePool();
  const { rows } = await pool.query<{ referral_code: string | null }>(
    `WITH aff AS (
       SELECT pa.agent_id, pa.super_id, u.parent_id
         FROM public.player_affiliation pa
         JOIN public.users u ON u.id = pa.user_id
        WHERE pa.user_id = $1
     )
     SELECT ref.referral_code
       FROM (
         SELECT u.referral_code, 1 AS ord
           FROM public.users u
           JOIN aff ON aff.agent_id = u.id
          WHERE u.status = 'active'
            AND u.role = 'agent'::public.user_role
            AND u.referral_code IS NOT NULL
         UNION ALL
         SELECT u.referral_code, 2 AS ord
           FROM public.users u
           JOIN aff ON aff.super_id = u.id
          WHERE u.status = 'active'
            AND u.role = 'super'::public.user_role
            AND u.referral_code IS NOT NULL
         UNION ALL
         SELECT u.referral_code, 3 AS ord
           FROM public.users u
           JOIN aff ON aff.parent_id = u.id
          WHERE u.status = 'active'
            AND u.role IN ('admin'::public.user_role, 'agent'::public.user_role, 'super'::public.user_role)
            AND u.referral_code IS NOT NULL
       ) ref
      ORDER BY ref.ord
      LIMIT 1`,
    [userId]
  );
  const code = rows[0]?.referral_code;
  return code ? code.trim().toUpperCase() : null;
}

export async function getWatchInviteBannerForWatchCode(
  watchCode: number
): Promise<WatchInviteBanner> {
  const globalBanner = await getWatchInviteBanner();
  const pool = requirePool();
  const { rows } = await pool.query<{ meta: Record<string, unknown> | null }>(
    `SELECT meta FROM public.tournaments WHERE watch_code = $1 LIMIT 1`,
    [watchCode]
  );
  const override = rows[0]?.meta?.watch_invite_banner as
    | WatchInviteBannerMetaOverride
    | undefined;
  return mergeWatchInviteBanner(globalBanner, override);
}

export async function getWatchInviteBannerForTournamentId(
  tournamentId: string
): Promise<WatchInviteBanner> {
  const globalBanner = await getWatchInviteBanner();
  const pool = requirePool();
  const { rows } = await pool.query<{ meta: Record<string, unknown> | null }>(
    `SELECT meta FROM public.tournaments WHERE id = $1 LIMIT 1`,
    [tournamentId]
  );
  const override = rows[0]?.meta?.watch_invite_banner as
    | WatchInviteBannerMetaOverride
    | undefined;
  return mergeWatchInviteBanner(globalBanner, override);
}

export async function getWatchInviteBanner(): Promise<WatchInviteBanner> {
  const pool = requirePool();
  const { rows } = await pool.query<{
    title: string;
    caption: string;
    image_url: string | null;
    image_width: number | null;
    image_height: number | null;
    is_enabled: boolean;
  }>(
    `SELECT title, caption, image_url, image_width, image_height, is_enabled
       FROM public.watch_invite_banner_settings
      WHERE id = true
      LIMIT 1`
  );
  const row = rows[0];
  return {
    title: row?.title ?? "",
    caption: row?.caption ?? "",
    imageUrl: row?.image_url ?? null,
    imageWidth: row?.image_width ?? null,
    imageHeight: row?.image_height ?? null,
    isEnabled: row?.is_enabled === true,
  };
}

export async function updateWatchInviteBanner(input: {
  title: string;
  caption: string;
  imageUrl: string | null;
  imageSize: number | null;
  imageWidth: number | null;
  imageHeight: number | null;
  isEnabled: boolean;
  updatedBy: string;
}) {
  const pool = requirePool();
  await pool.query(
    `UPDATE public.watch_invite_banner_settings
        SET title = $1,
            caption = $2,
            image_url = $3,
            image_size = $4,
            image_width = $5,
            image_height = $6,
            is_enabled = $7,
            updated_at = now(),
            updated_by = $8
      WHERE id = true`,
    [
      input.title,
      input.caption,
      input.imageUrl,
      input.imageSize,
      input.imageWidth,
      input.imageHeight,
      input.isEnabled,
      input.updatedBy,
    ]
  );
}

export async function loadWatchTournamentSnapshot(
  watchCode: number
): Promise<WatchTournamentSnapshot | null> {
  const tournament = await getTournamentByWatchCode(watchCode);
  if (!tournament) return null;

  const pool = requirePool();
  const meta = (tournament.meta ?? {}) as Record<string, unknown>;
  const entryCurrency = String(meta.entry_currency || tournament.currency || "IRR").toUpperCase();
  const finalWinnersCount = Number(meta.final_winners_count ?? 1);
  const minPlayersToStart = Number(meta.min_players_to_start ?? 3);
  const roundBreakEndsAt =
    typeof meta.round_break_ends_at === "string" ? meta.round_break_ends_at : null;

  const [{ rows: entryRows }, { rows: ticketRows }, { rows: roundRows }] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS count
         FROM public.tournament_entries
        WHERE tournament_id = $1
          AND status IN ('created', 'settled')`,
      [tournament.id]
    ),
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(tickets_count), 0)::text AS total
         FROM public.tournament_entries
        WHERE tournament_id = $1
          AND status IN ('created', 'settled')`,
      [tournament.id]
    ),
    pool.query<{
      room_id: string;
      round_no: number;
      table_no: number;
      room_status: string | null;
    }>(
      `SELECT trr.room_id, trr.round_no, trr.table_no, r.status AS room_status
         FROM public.tournament_round_rooms trr
         LEFT JOIN public.rooms r ON r.id = trr.room_id
        WHERE trr.tournament_id = $1
          AND trr.room_id IS NOT NULL
        ORDER BY trr.round_no DESC, trr.table_no ASC`,
      [tournament.id]
    ),
  ]);

  const roomIds = roundRows.map((r) => r.room_id).filter(Boolean);
  let tables: WatchTournamentTable[] = [];

  if (roomIds.length > 0) {
    const [{ rows: assignmentRows }, { rows: winnerRows }] = await Promise.all([
      pool.query<{
        room_id: string | null;
        game_room_id: string | null;
        user_id: string | null;
        cards_count: number | null;
      }>(
        `SELECT room_id, game_room_id, user_id, cards_count
           FROM public.tournament_round_assignments
          WHERE tournament_id = $1`,
        [tournament.id]
      ),
      pool.query<{ room_id: string; user_id: string; nickname: string | null; username: string | null }>(
        `SELECT rw.room_id, rw.user_id, up.nickname, u.username
           FROM public.room_winners rw
           JOIN public.users u ON u.id = rw.user_id
           LEFT JOIN public.user_profiles up ON up.user_id = u.id
          WHERE rw.room_id = ANY($1::uuid[])`,
        [roomIds]
      ),
    ]);

    const stats = new Map<string, { players: Set<string>; cards: number }>();
    for (const row of assignmentRows) {
      const roomId = (row.game_room_id || row.room_id) as string | null;
      if (!roomId || !roomIds.includes(roomId)) continue;
      if (!stats.has(roomId)) stats.set(roomId, { players: new Set(), cards: 0 });
      const s = stats.get(roomId)!;
      if (row.user_id) s.players.add(row.user_id);
      s.cards += Number(row.cards_count || 0);
    }

    const winnersByRoom = new Map<string, string[]>();
    for (const w of winnerRows) {
      const name = w.nickname?.trim() || w.username?.trim() || "بازیکن";
      if (!winnersByRoom.has(w.room_id)) winnersByRoom.set(w.room_id, []);
      winnersByRoom.get(w.room_id)!.push(name);
    }

    const ticketPrice = Number(tournament.ticket_price || 0);
    tables = roundRows.map((row) => {
      const roomId = row.room_id;
      const stat = stats.get(roomId) || { players: new Set<string>(), cards: 0 };
      const finished = ["finished", "settling", "settled"].includes(
        (row.room_status || "").toLowerCase()
      );
      return {
        id: roomId,
        prize: ticketPrice * stat.cards,
        players: stat.players.size,
        cardCount: stat.cards,
        roundNo: row.round_no,
        tableNo: row.table_no,
        ...(finished
          ? { isFinished: true, winnerNames: winnersByRoom.get(roomId) || [] }
          : {}),
      };
    });
  }

  const currentRoundNo =
    roundRows.length > 0
      ? Math.max(...roundRows.map((r) => r.round_no))
      : null;

  return {
    watchCode: tournament.watch_code,
    title: tournament.title,
    status: tournament.status,
    startAt: tournament.start_at,
    ticketPrice: Number(tournament.ticket_price || 0),
    guaranteedPrize: Number(tournament.guaranteed_prize || 0),
    commissionRate: Number(tournament.commission_rate || 0),
    entryCurrency,
    minTicketsPerPlayer: tournament.min_tickets_per_player,
    maxTicketsPerPlayer: tournament.max_tickets_per_player,
    tableSizeMode: tournament.table_size_mode,
    tableSizeFixed: tournament.table_size_fixed,
    tableSizeMin: tournament.table_size_min,
    tableSizeMax: tournament.table_size_max,
    laterRoundTableSizeMode: tournament.later_round_table_size_mode,
    laterRoundTableSizeFixed: tournament.later_round_table_size_fixed,
    laterRoundTableSizeMin: tournament.later_round_table_size_min,
    laterRoundTableSizeMax: tournament.later_round_table_size_max,
    finalWinnersCount,
    minPlayersToStart,
    roundBreakEndsAt,
    playerCount: Number(entryRows[0]?.count || 0),
    totalTickets: Number(ticketRows[0]?.total || 0),
    currentRoundNo,
    tables,
  };
}
