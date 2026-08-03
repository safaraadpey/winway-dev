import { pgPool } from "@/lib/pg";
import type {
  SessionParticipantReportRow,
  SessionReportRow,
  SessionsAnalyticsResult,
  SessionsReportResult,
} from "./types";
import type { SessionsQueryArgs } from "./legacySessionsReport";

/**
 * Platform-native sessions report (game_sessions + session_participants).
 * Requires DATABASE_URL (platform schema not exposed on PostgREST).
 */
export async function fetchPlatformSessionsReport(
  args: SessionsQueryArgs
): Promise<SessionsReportResult> {
  if (!pgPool) {
    throw new Error("DATABASE_URL not configured; cannot read platform.*");
  }

  const { from, to, page, pageSize, statuses } = args;
  const offset = (page - 1) * pageSize;
  const statusFilter = statuses?.length ? statuses : null;

  const countRes = await pgPool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM platform.game_sessions gs
     WHERE gs.correlation_key LIKE 'bingo.room:%'
       AND gs.created_at >= $1::timestamptz
       AND gs.created_at <= $2::timestamptz
       AND ($3::text[] IS NULL OR gs.status = ANY($3::text[]))`,
    [from.toISOString(), to.toISOString(), statusFilter]
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const sessionsRes = await pgPool.query<{
    id: string;
    status: string;
    game_slug: string;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    settled_at: string | null;
    participant_count: number;
  }>(
    `SELECT gs.id, gs.status, g.code AS game_slug,
            gs.created_at, gs.started_at, gs.finished_at, gs.settled_at,
            gs.participant_count
     FROM platform.game_sessions gs
     JOIN platform.games g ON g.id = gs.game_id
     WHERE gs.correlation_key LIKE 'bingo.room:%'
       AND gs.created_at >= $1::timestamptz
       AND gs.created_at <= $2::timestamptz
       AND ($3::text[] IS NULL OR gs.status = ANY($3::text[]))
     ORDER BY gs.created_at DESC
     LIMIT $4 OFFSET $5`,
    [from.toISOString(), to.toISOString(), statusFilter, pageSize, offset]
  );

  const sessionIds = sessionsRes.rows.map((r) => r.id);
  const participantsBySession = new Map<string, SessionParticipantReportRow[]>();

  if (sessionIds.length > 0) {
    const partRes = await pgPool.query<{
      session_id: string;
      user_id: string;
      status: string;
      ticket_count: number;
      amount_total: string;
      joined_at: string | null;
      left_at: string | null;
      source_updated_at: string | null;
    }>(
      `SELECT session_id, user_id, status, ticket_count, amount_total::text,
              joined_at, left_at, source_updated_at
       FROM platform.session_participants
       WHERE session_id = ANY($1::uuid[])
       ORDER BY user_id`,
      [sessionIds]
    );

    for (const p of partRes.rows) {
      const list = participantsBySession.get(p.session_id) || [];
      list.push({
        userId: p.user_id,
        status: p.status,
        ticketCount: Number(p.ticket_count || 0),
        amountTotal: Number(Number(p.amount_total || 0).toFixed(2)),
        joinedAt: p.joined_at,
        leftAt: p.left_at,
        sourceUpdatedAt: p.source_updated_at,
      });
      participantsBySession.set(p.session_id, list);
    }
  }

  const items: SessionReportRow[] = sessionsRes.rows.map((s) => {
    const participants = participantsBySession.get(s.id) || [];
    const amountTotal = participants.reduce((sum, p) => sum + p.amountTotal, 0);
    // P5.9: cancelled sessions expose no lifecycle timestamps in the admin report.
    const isCancelled = s.status === "cancelled";
    return {
      sessionId: s.id,
      gameSlug: s.game_slug || "bingo",
      status: s.status,
      createdAt: s.created_at,
      startedAt: isCancelled ? null : s.started_at,
      finishedAt: isCancelled ? null : s.finished_at,
      settledAt: isCancelled ? null : s.settled_at,
      participantCount: Number(s.participant_count || 0),
      amountTotal: Number(amountTotal.toFixed(2)),
      participants,
    };
  });

  return {
    items,
    totalCount,
    page,
    pageSize,
    source: "platform",
  };
}

/**
 * Platform analytics aggregates (non-financial shell only).
 * Uses game_sessions + session_participants; does not read prize/commission lines.
 */
export async function fetchPlatformSessionsAnalytics(args: {
  from: Date;
  to: Date;
  statuses?: string[];
}): Promise<SessionsAnalyticsResult> {
  if (!pgPool) {
    throw new Error("DATABASE_URL not configured; cannot read platform.*");
  }

  const statusFilter = args.statuses?.length ? args.statuses : null;

  const statusRes = await pgPool.query<{ status: string; n: string }>(
    `SELECT gs.status, count(*)::text AS n
     FROM platform.game_sessions gs
     WHERE gs.correlation_key LIKE 'bingo.room:%'
       AND gs.created_at >= $1::timestamptz
       AND gs.created_at <= $2::timestamptz
       AND ($3::text[] IS NULL OR gs.status = ANY($3::text[]))
     GROUP BY gs.status`,
    [args.from.toISOString(), args.to.toISOString(), statusFilter]
  );

  const byStatus: Record<string, number> = {};
  let sessionCount = 0;
  for (const row of statusRes.rows) {
    const n = Number(row.n || 0);
    byStatus[row.status] = n;
    sessionCount += n;
  }

  const partRes = await pgPool.query<{
    participant_count: string;
    amount_total: string;
  }>(
    `SELECT
       coalesce(sum(gs.participant_count), 0)::text AS participant_count,
       coalesce(sum(p.amount_total), 0)::text AS amount_total
     FROM platform.game_sessions gs
     LEFT JOIN LATERAL (
       SELECT coalesce(sum(sp.amount_total), 0) AS amount_total
       FROM platform.session_participants sp
       WHERE sp.session_id = gs.id
     ) p ON true
     WHERE gs.correlation_key LIKE 'bingo.room:%'
       AND gs.created_at >= $1::timestamptz
       AND gs.created_at <= $2::timestamptz
       AND ($3::text[] IS NULL OR gs.status = ANY($3::text[]))`,
    [args.from.toISOString(), args.to.toISOString(), statusFilter]
  );

  return {
    source: "platform",
    from: args.from.toISOString(),
    to: args.to.toISOString(),
    sessionCount,
    participantCount: Number(partRes.rows[0]?.participant_count || 0),
    amountTotal: Number(Number(partRes.rows[0]?.amount_total || 0).toFixed(2)),
    byStatus,
  };
}
