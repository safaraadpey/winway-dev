import { pgPool } from "@/lib/pg";
import type { SessionParticipantReportRow, SessionReportRow, SessionsReportResult } from "./types";

/**
 * Platform-native sessions report (game_sessions + session_participants).
 * Requires DATABASE_URL (platform schema not exposed on PostgREST).
 */
export async function fetchPlatformSessionsReport(args: {
  from: Date;
  to: Date;
  page: number;
  pageSize: number;
}): Promise<SessionsReportResult> {
  if (!pgPool) {
    throw new Error("DATABASE_URL not configured; cannot read platform.*");
  }

  const { from, to, page, pageSize } = args;
  const offset = (page - 1) * pageSize;

  const countRes = await pgPool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM platform.game_sessions gs
     WHERE gs.correlation_key LIKE 'bingo.room:%'
       AND gs.created_at >= $1::timestamptz
       AND gs.created_at <= $2::timestamptz`,
    [from.toISOString(), to.toISOString()]
  );
  const totalCount = Number(countRes.rows[0]?.count || 0);

  const sessionsRes = await pgPool.query<{
    id: string;
    status: string;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    settled_at: string | null;
    participant_count: number;
  }>(
    `SELECT gs.id, gs.status, gs.created_at, gs.started_at, gs.finished_at, gs.settled_at,
            gs.participant_count
     FROM platform.game_sessions gs
     WHERE gs.correlation_key LIKE 'bingo.room:%'
       AND gs.created_at >= $1::timestamptz
       AND gs.created_at <= $2::timestamptz
     ORDER BY gs.created_at DESC
     LIMIT $3 OFFSET $4`,
    [from.toISOString(), to.toISOString(), pageSize, offset]
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
    // Legacy contract: cancelled sessions expose no lifecycle timestamps in the admin report.
    // Stored platform.game_sessions columns are left unchanged (P5.9 projection-only).
    const isCancelled = s.status === "cancelled";
    return {
      sessionId: s.id,
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
