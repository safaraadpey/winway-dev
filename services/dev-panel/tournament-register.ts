import { randomUUID } from "crypto";
import { generateRegistrationSchedule } from "@/lib/dev-panel/tournamentRegistrationSchedule";
import { connectPgWithRetry } from "@/lib/db/pgConnect";
import { pgPool } from "@/lib/pg";
import type {
  DevRegistrationCampaignDetail,
  DevRegistrationCampaignMode,
  DevRegistrationCampaignSummary,
  DevRegistrationScheduleRow,
  DevTournamentRegisterActionResult,
  DevTournamentRegisterOverview,
  DevTournamentRegisterPreviewResult,
  DevTournamentRegisterTournament,
} from "@/src/types/dev-tournament-register";

const LOG_PREFIX = "[DevRegister]";

type TournamentRow = {
  id: string;
  title: string;
  status: string;
  start_at: string | null;
  ticket_price: string | number | null;
  min_tickets_per_player: number | null;
  max_tickets_per_player: number | null;
  created_at: string;
};

type CampaignRow = {
  id: string;
  batch_id: string | null;
  name: string;
  tournament_id: string;
  tournament_title: string;
  tournament_start_at: string | null;
  operator_id: string | null;
  operator_username: string | null;
  operator_nickname: string | null;
  registration_open_time: string;
  mode: DevRegistrationCampaignMode;
  status: DevRegistrationCampaignSummary["status"];
  player_count: number;
  summary: Record<string, unknown> | null;
  created_at: string;
  pending: string | null;
  registered: string | null;
  skipped: string | null;
  failed: string | null;
  cancelled: string | null;
};

function mapTournament(row: TournamentRow): DevTournamentRegisterTournament {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    startAt: row.start_at,
    ticketPrice: Number(row.ticket_price ?? 0),
    minTicketsPerPlayer: Number(row.min_tickets_per_player ?? 1),
    maxTicketsPerPlayer: Number(row.max_tickets_per_player ?? 1),
    createdAt: row.created_at,
  };
}

function operatorDisplayName(row: Pick<CampaignRow, "operator_nickname" | "operator_username">): string | null {
  const nickname = row.operator_nickname?.trim();
  const username = row.operator_username?.trim();
  return nickname || username || null;
}

function mapCampaign(row: CampaignRow): DevRegistrationCampaignSummary {
  const summary = row.summary ?? {};
  const isImmediate = row.mode === "immediate";

  return {
    id: row.id,
    batchId: row.batch_id,
    name: row.name,
    tournamentId: row.tournament_id,
    tournamentTitle: row.tournament_title,
    tournamentStartAt: row.tournament_start_at,
    operatorId: row.operator_id,
    operatorName: operatorDisplayName(row),
    registrationOpenTime: row.registration_open_time,
    mode: row.mode,
    status: row.status,
    playerCount: Number(row.player_count),
    pending: isImmediate ? 0 : Number(row.pending ?? 0),
    registered: isImmediate
      ? Number(summary.registered ?? 0)
      : Number(row.registered ?? 0),
    skipped: isImmediate ? Number(summary.skipped ?? 0) : Number(row.skipped ?? 0),
    failed: isImmediate ? Number(summary.failed ?? 0) : Number(row.failed ?? 0),
    cancelled: isImmediate ? 0 : Number(row.cancelled ?? 0),
    createdAt: row.created_at,
  };
}

function buildCampaignName(params: {
  tournamentTitle: string;
  operatorName: string | null;
  mode: DevRegistrationCampaignMode;
}): string {
  const operatorLabel = params.operatorName ?? "بدون اپراتور";
  const modeLabel = params.mode === "immediate" ? "ثبت فوری" : "زمان‌بندی";
  return `${params.tournamentTitle} — ${operatorLabel} — ${modeLabel}`;
}

async function loadOperatorName(client: Awaited<ReturnType<typeof connectPgWithRetry>>, operatorId?: string) {
  if (!operatorId) return null;

  const { rows } = await client.query<{ username: string | null; nickname: string | null }>(
    `SELECT u.username, p.nickname
       FROM public.users u
       LEFT JOIN public.user_profiles p ON p.user_id = u.id
      WHERE u.id = $1`,
    [operatorId]
  );
  const row = rows[0];
  if (!row) return null;
  return row.nickname?.trim() || row.username?.trim() || null;
}

async function loadTournamentTitle(client: Awaited<ReturnType<typeof connectPgWithRetry>>, tournamentId: string) {
  const { rows } = await client.query<{ title: string }>(
    `SELECT title FROM public.tournaments WHERE id = $1`,
    [tournamentId]
  );
  return rows[0]?.title ?? "تورنومنت";
}

const CAMPAIGN_SELECT = `
  SELECT
    c.id,
    c.batch_id,
    c.name,
    c.tournament_id,
    t.title AS tournament_title,
    t.start_at AS tournament_start_at,
    c.operator_id,
    op.username AS operator_username,
    op_profile.nickname AS operator_nickname,
    c.registration_open_time,
    c.mode,
    c.status,
    c.player_count,
    c.summary,
    c.created_at,
    stats.pending,
    stats.registered,
    stats.skipped,
    stats.failed,
    stats.cancelled
  FROM tournament.dev_registration_campaigns c
  JOIN public.tournaments t ON t.id = c.tournament_id
  LEFT JOIN public.users op ON op.id = c.operator_id
  LEFT JOIN public.user_profiles op_profile ON op_profile.user_id = c.operator_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE s.status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE s.status = 'registered') AS registered,
      COUNT(*) FILTER (WHERE s.status = 'skipped') AS skipped,
      COUNT(*) FILTER (WHERE s.status = 'failed') AS failed,
      COUNT(*) FILTER (WHERE s.status = 'cancelled') AS cancelled
    FROM tournament.dev_registration_schedule s
    WHERE s.batch_id = c.batch_id
  ) stats ON c.mode = 'scheduled'
`;

async function syncCompletedCampaignStatuses(
  client: Awaited<ReturnType<typeof connectPgWithRetry>>
) {
  await client.query(
    `UPDATE tournament.dev_registration_campaigns c
        SET status = 'completed',
            updated_at = now()
      WHERE c.mode = 'scheduled'
        AND c.status = 'active'
        AND c.batch_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM tournament.dev_registration_schedule s
           WHERE s.batch_id = c.batch_id
             AND s.status = 'pending'
        )
        AND EXISTS (
          SELECT 1
            FROM tournament.dev_registration_schedule s
           WHERE s.batch_id = c.batch_id
        )`
  );
}

export async function loadTournamentRegisterOverview(): Promise<DevTournamentRegisterOverview> {
  const client = await connectPgWithRetry(pgPool);

  try {
    await syncCompletedCampaignStatuses(client);

    const [tournamentsResult, campaignsResult] = await Promise.all([
      client.query<TournamentRow>(
        `SELECT id, title, status, start_at, ticket_price, min_tickets_per_player, max_tickets_per_player, created_at
           FROM public.tournaments
          WHERE status = 'registration_open'::public.tournament_status
          ORDER BY created_at DESC`
      ),
      client.query<CampaignRow>(
        `${CAMPAIGN_SELECT}
         ORDER BY c.created_at DESC
         LIMIT 100`
      ),
    ]);

    const campaigns = campaignsResult.rows.map(mapCampaign).map((campaign) => {
      if (campaign.mode !== "scheduled" || campaign.status !== "active") return campaign;
      if (campaign.pending > 0) return campaign;
      return { ...campaign, status: "completed" as const };
    });

    return {
      tournaments: tournamentsResult.rows.map(mapTournament),
      campaigns,
    };
  } finally {
    client.release();
  }
}

export async function loadRegistrationCampaignDetail(
  campaignId: string
): Promise<DevRegistrationCampaignDetail | null> {
  const client = await connectPgWithRetry(pgPool);

  try {
    await syncCompletedCampaignStatuses(client);

    const { rows } = await client.query<CampaignRow>(
      `${CAMPAIGN_SELECT}
       WHERE c.id = $1
       LIMIT 1`,
      [campaignId]
    );
    const row = rows[0];
    if (!row) return null;

    let items: DevRegistrationScheduleRow[] = [];
    if (row.batch_id) {
      items = await loadBatchScheduleRows(row.batch_id);
    }

    return {
      ...mapCampaign(row),
      items,
    };
  } finally {
    client.release();
  }
}

export async function loadBatchScheduleRows(batchId: string): Promise<DevRegistrationScheduleRow[]> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const { rows } = await client.query<{
      id: string;
      batch_id: string;
      tournament_id: string;
      tournament_title: string;
      user_id: string;
      username: string;
      scheduled_at: string;
      status: DevRegistrationScheduleRow["status"];
      error_text: string | null;
      processed_at: string | null;
    }>(
      `SELECT
         s.id,
         s.batch_id,
         s.tournament_id,
         t.title AS tournament_title,
         s.user_id,
         u.username,
         s.scheduled_at,
         s.status,
         s.error_text,
         s.processed_at
       FROM tournament.dev_registration_schedule s
       JOIN public.tournaments t ON t.id = s.tournament_id
       JOIN public.users u ON u.id = s.user_id
       WHERE s.batch_id = $1
       ORDER BY s.scheduled_at ASC`,
      [batchId]
    );

    return rows.map((item) => ({
      id: item.id,
      batchId: item.batch_id,
      tournamentId: item.tournament_id,
      tournamentTitle: item.tournament_title,
      userId: item.user_id,
      username: item.username,
      scheduledAt: item.scheduled_at,
      status: item.status,
      errorText: item.error_text,
      processedAt: item.processed_at,
    }));
  } finally {
    client.release();
  }
}

export async function previewTournamentRegistration(params: {
  tournamentId: string;
  registrationOpenTime: string;
  playerIds: string[];
}): Promise<DevTournamentRegisterPreviewResult> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const tournamentResult = await client.query<{ start_at: string | null }>(
      `SELECT start_at FROM public.tournaments WHERE id = $1`,
      [params.tournamentId]
    );
    const tournament = tournamentResult.rows[0];
    if (!tournament) {
      throw new Error("tournament not found");
    }

    const uniquePlayerIds = [...new Set(params.playerIds.filter(Boolean))];
    if (uniquePlayerIds.length === 0) {
      return { items: [] };
    }

    const usersResult = await client.query<{ id: string; username: string }>(
      `SELECT id, username FROM public.users WHERE id = ANY($1::uuid[])`,
      [uniquePlayerIds]
    );
    const usernameById = new Map(usersResult.rows.map((row) => [row.id, row.username]));

    const schedule = generateRegistrationSchedule({
      registrationOpenTime: new Date(params.registrationOpenTime),
      playerIds: uniquePlayerIds,
      tournamentStartAt: tournament.start_at ? new Date(tournament.start_at) : null,
    });

    console.log(`${LOG_PREFIX} preview tournament=${params.tournamentId} players=${schedule.length}`);

    return {
      items: schedule.map((item) => ({
        userId: item.userId,
        username: usernameById.get(item.userId) ?? item.userId,
        scheduledAt: item.scheduledAt.toISOString(),
      })),
    };
  } finally {
    client.release();
  }
}

export async function registerTournamentPlayersImmediate(params: {
  tournamentId: string;
  playerIds: string[];
  qty?: number;
  operatorId?: string;
  name?: string;
  registrationOpenTime?: string;
  createdBy: string;
}): Promise<DevTournamentRegisterActionResult> {
  const client = await connectPgWithRetry(pgPool);
  const uniquePlayerIds = [...new Set(params.playerIds.filter(Boolean))];
  const registrationOpenTime = params.registrationOpenTime ?? new Date().toISOString();

  try {
    await client.query("BEGIN");

    const tournamentTitle = await loadTournamentTitle(client, params.tournamentId);
    const operatorName = await loadOperatorName(client, params.operatorId);
    const campaignName =
      params.name?.trim() ||
      buildCampaignName({
        tournamentTitle,
        operatorName,
        mode: "immediate",
      });

    const campaignInsert = await client.query<{ id: string }>(
      `INSERT INTO tournament.dev_registration_campaigns (
         name, tournament_id, operator_id, registration_open_time,
         mode, status, player_count, created_by
       ) VALUES ($1, $2, $3, $4, 'immediate', 'active', $5, $6)
       RETURNING id`,
      [
        campaignName,
        params.tournamentId,
        params.operatorId ?? null,
        registrationOpenTime,
        uniquePlayerIds.length,
        params.createdBy,
      ]
    );
    const campaignId = campaignInsert.rows[0]!.id;

    console.log(
      `${LOG_PREFIX} immediate campaign=${campaignId} tournament=${params.tournamentId} players=${uniquePlayerIds.length}`
    );

    const { rows } = await client.query<{
      username: string | null;
      user_id: string;
      entry_id: string | null;
      action: string;
      detail: string | null;
    }>(
      `SELECT username, user_id, entry_id, action, detail
         FROM tournament.fn_dev_register_user_ids($1::uuid, $2::uuid[], $3::integer)`,
      [params.tournamentId, uniquePlayerIds, params.qty ?? 1]
    );

    const result = summarizeActionResults(rows);
    await client.query(
      `UPDATE tournament.dev_registration_campaigns
          SET status = 'completed',
              summary = $2::jsonb,
              updated_at = now()
        WHERE id = $1`,
      [
        campaignId,
        JSON.stringify(result.summary),
      ]
    );

    await client.query("COMMIT");

    return {
      ...result,
      campaignId,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function scheduleTournamentRegistration(params: {
  tournamentId: string;
  createdBy: string;
  operatorId?: string;
  name?: string;
  registrationOpenTime?: string;
  items: Array<{ userId: string; scheduledAt: string }>;
}): Promise<DevTournamentRegisterActionResult> {
  const client = await connectPgWithRetry(pgPool);
  const batchId = randomUUID();
  const uniqueItems = params.items.filter((item) => item.userId && item.scheduledAt);
  const registrationOpenTime = params.registrationOpenTime ?? new Date().toISOString();

  if (uniqueItems.length === 0) {
    throw new Error("no schedule items provided");
  }

  try {
    await client.query("BEGIN");

    const tournamentTitle = await loadTournamentTitle(client, params.tournamentId);
    const operatorName = await loadOperatorName(client, params.operatorId);
    const campaignName =
      params.name?.trim() ||
      buildCampaignName({
        tournamentTitle,
        operatorName,
        mode: "scheduled",
      });

    const campaignInsert = await client.query<{ id: string }>(
      `INSERT INTO tournament.dev_registration_campaigns (
         batch_id, name, tournament_id, operator_id, registration_open_time,
         mode, status, player_count, created_by
       ) VALUES ($1, $2, $3, $4, $5, 'scheduled', 'active', $6, $7)
       RETURNING id`,
      [
        batchId,
        campaignName,
        params.tournamentId,
        params.operatorId ?? null,
        registrationOpenTime,
        uniqueItems.length,
        params.createdBy,
      ]
    );
    const campaignId = campaignInsert.rows[0]!.id;

    for (const item of uniqueItems) {
      const insertResult = await client.query<{ id: string }>(
        `INSERT INTO tournament.dev_registration_schedule (
           batch_id, tournament_id, user_id, scheduled_at, status, created_by
         ) VALUES ($1, $2, $3, $4, 'pending', $5)
         ON CONFLICT (tournament_id, user_id)
           WHERE status IN ('pending', 'registered')
         DO NOTHING
         RETURNING id`,
        [batchId, params.tournamentId, item.userId, item.scheduledAt, params.createdBy]
      );
      if ((insertResult.rowCount ?? 0) === 0) {
        console.log(
          `${LOG_PREFIX} schedule skip duplicate tournament=${params.tournamentId} user=${item.userId}`
        );
      }
    }

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM tournament.dev_registration_schedule WHERE batch_id = $1`,
      [batchId]
    );
    const scheduledCount = Number(countResult.rows[0]?.count ?? 0);

    await client.query(
      `UPDATE tournament.dev_registration_campaigns
          SET player_count = $2,
              updated_at = now()
        WHERE id = $1`,
      [campaignId, scheduledCount]
    );

    await client.query("COMMIT");

    console.log(
      `${LOG_PREFIX} schedule campaign=${campaignId} batch=${batchId} tournament=${params.tournamentId} count=${scheduledCount}`
    );

    return {
      campaignId,
      batchId,
      results: [],
      summary: {
        registered: 0,
        skipped: 0,
        failed: 0,
        scheduled: scheduledCount,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelTournamentRegistrationCampaign(params: {
  campaignId: string;
}): Promise<DevTournamentRegisterActionResult> {
  const client = await connectPgWithRetry(pgPool);

  try {
    await client.query("BEGIN");

    const campaignResult = await client.query<{ batch_id: string | null; mode: string }>(
      `SELECT batch_id, mode FROM tournament.dev_registration_campaigns WHERE id = $1 FOR UPDATE`,
      [params.campaignId]
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) {
      throw new Error("campaign not found");
    }

    let cancelled = 0;
    if (campaign.batch_id) {
      const result = await client.query<{ id: string }>(
        `UPDATE tournament.dev_registration_schedule
            SET status = 'cancelled',
                updated_at = now()
          WHERE batch_id = $1
            AND status = 'pending'
          RETURNING id`,
        [campaign.batch_id]
      );
      cancelled = result.rowCount ?? 0;
    }

    await client.query(
      `UPDATE tournament.dev_registration_campaigns
          SET status = 'cancelled',
              updated_at = now()
        WHERE id = $1`,
      [params.campaignId]
    );

    await client.query("COMMIT");

    console.log(`${LOG_PREFIX} cancel campaign=${params.campaignId} cancelled=${cancelled}`);

    return {
      campaignId: params.campaignId,
      batchId: campaign.batch_id ?? undefined,
      results: [],
      summary: {
        registered: 0,
        skipped: 0,
        failed: 0,
        cancelled,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function summarizeActionResults(
  rows: Array<{
    username: string | null;
    user_id: string;
    entry_id: string | null;
    action: string;
    detail: string | null;
  }>
): DevTournamentRegisterActionResult {
  let registered = 0;
  let skipped = 0;
  let failed = 0;

  const results = rows.map((row) => {
    if (row.action === "registered") registered += 1;
    else if (row.action === "skipped") skipped += 1;
    else failed += 1;

    return {
      username: row.username,
      userId: row.user_id,
      entryId: row.entry_id,
      action: row.action,
      detail: row.detail,
    };
  });

  return {
    results,
    summary: { registered, skipped, failed },
  };
}
