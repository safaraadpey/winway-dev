import type pg from "pg";

const LOG = "[Leo]";

export type RoundJoinJob = {
  id: string;
  user_id: string;
  template_id: string;
  card_count: number;
  session_index: number;
  window_date: string;
  window_band: string;
  scheduled_at: Date | string;
};

export async function resolveJoinWindowEnd(
  client: pg.PoolClient,
  job: RoundJoinJob
): Promise<Date | null> {
  const scheduledAt =
    job.scheduled_at instanceof Date ? job.scheduled_at : new Date(job.scheduled_at);

  const sameTemplate = await client.query<{ scheduled_at: Date | string }>(
    `SELECT scheduled_at
       FROM public.leo_execution_queue
      WHERE user_id = $1
        AND window_date = $2::date
        AND window_band = $3
        AND event_type = 'round_join'
        AND template_id = $4
        AND scheduled_at > $5
        AND status <> 'cancelled'
      ORDER BY scheduled_at ASC
      LIMIT 1`,
    [job.user_id, job.window_date, job.window_band, job.template_id, scheduledAt.toISOString()]
  );

  if (sameTemplate.rows[0]?.scheduled_at) {
    return new Date(sameTemplate.rows[0].scheduled_at);
  }

  const anyJoin = await client.query<{ scheduled_at: Date | string }>(
    `SELECT scheduled_at
       FROM public.leo_execution_queue
      WHERE user_id = $1
        AND window_date = $2::date
        AND window_band = $3
        AND event_type = 'round_join'
        AND scheduled_at > $4
        AND status <> 'cancelled'
      ORDER BY scheduled_at ASC
      LIMIT 1`,
    [job.user_id, job.window_date, job.window_band, scheduledAt.toISOString()]
  );

  if (anyJoin.rows[0]?.scheduled_at) {
    return new Date(anyJoin.rows[0].scheduled_at);
  }

  const boundary = await client.query<{ scheduled_at: Date | string }>(
    `SELECT scheduled_at
       FROM public.leo_execution_queue
      WHERE user_id = $1
        AND window_date = $2::date
        AND window_band = $3
        AND event_type IN ('exit', 'break')
        AND scheduled_at > $4
        AND status <> 'cancelled'
      ORDER BY scheduled_at ASC
      LIMIT 1`,
    [job.user_id, job.window_date, job.window_band, scheduledAt.toISOString()]
  );

  if (boundary.rows[0]?.scheduled_at) {
    return new Date(boundary.rows[0].scheduled_at);
  }

  return null;
}

async function deferRoundJoin(client: pg.PoolClient, jobId: string, reason: string): Promise<void> {
  await client.query(
    `UPDATE public.leo_execution_queue
        SET status = 'pending', updated_at = now(), error_text = $2
      WHERE id = $1`,
    [jobId, reason]
  );
}

async function countLeoPlayersInRoom(
  client: pg.PoolClient,
  roomId: string
): Promise<number> {
  const result = await client.query<{ leo_count: string }>(
    `SELECT COUNT(DISTINCT t.player_user_id)::text AS leo_count
       FROM public.tickets t
       JOIN public.leo_user_configs c ON c.user_id = t.player_user_id AND c.is_enabled = true
      WHERE t.room_id = $1
        AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')`,
    [roomId]
  );
  return Number(result.rows[0]?.leo_count ?? 0);
}

async function isUserSeatedInRoom(
  client: pg.PoolClient,
  roomId: string,
  userId: string
): Promise<boolean> {
  const result = await client.query<{ seated: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM public.tickets t
        WHERE t.room_id = $1
          AND t.player_user_id = $2
          AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
     ) AS seated`,
    [roomId, userId]
  );
  return result.rows[0]?.seated === true;
}

export type RoundJoinOutcome =
  | { kind: "done" }
  | { kind: "deferred"; reason: string }
  | { kind: "skipped"; reason: string };

export function resolveEffectiveCardCount(requested: number, maxCap: number): number {
  if (maxCap <= 0) return requested;
  return Math.min(requested, maxCap);
}

export async function processRoundJoin(
  client: pg.PoolClient,
  job: RoundJoinJob,
  maxLeoPlayersPerWaitingRoom: number,
  maxLeoCardsPerJoin: number
): Promise<RoundJoinOutcome> {
  const now = new Date();
  const validUntil = await resolveJoinWindowEnd(client, job);

  if (validUntil && now.getTime() >= validUntil.getTime()) {
    console.log(
      `${LOG} join window_expired user=${job.user_id} template=${job.template_id} validUntil=${validUntil.toISOString()}`
    );
    return { kind: "skipped", reason: "window_expired" };
  }

  const cardCount = resolveEffectiveCardCount(job.card_count, maxLeoCardsPerJoin);
  if (cardCount !== job.card_count) {
    console.log(
      `${LOG} join card_cap user=${job.user_id} requested=${job.card_count} effective=${cardCount} cap=${maxLeoCardsPerJoin}`
    );
  }

  await client.query("BEGIN");
  try {
    const roomResult = await client.query<{ id: string }>(
      `SELECT id
         FROM public.rooms
        WHERE status = 'waiting'
          AND room_template_id = $1
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE`,
      [job.template_id]
    );

    const waitingRoomId = roomResult.rows[0]?.id ?? null;

    if (waitingRoomId) {
      const seated = await isUserSeatedInRoom(client, waitingRoomId, job.user_id);
      if (seated) {
        await client.query("COMMIT");
        console.log(
          `${LOG} join already_seated user=${job.user_id} room=${waitingRoomId} template=${job.template_id}`
        );
        return { kind: "done" };
      }

      if (maxLeoPlayersPerWaitingRoom > 0) {
        const leoCount = await countLeoPlayersInRoom(client, waitingRoomId);
        if (leoCount >= maxLeoPlayersPerWaitingRoom) {
          await client.query("ROLLBACK");
          console.log(
            `${LOG} join deferred user=${job.user_id} room=${waitingRoomId} leoCount=${leoCount} cap=${maxLeoPlayersPerWaitingRoom} validUntil=${validUntil?.toISOString() ?? "none"}`
          );
          await deferRoundJoin(client, job.id, "waiting_room_leo_cap");
          return { kind: "deferred", reason: "waiting_room_leo_cap" };
        }
      }

      try {
        await client.query(
          `SELECT room_id, ticket_ids
             FROM game_core.fn_system_join_room($1::uuid, $2::uuid, $3::integer, NULL)`,
          [job.user_id, waitingRoomId, cardCount]
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("room is full")) {
          await client.query("ROLLBACK");
          console.log(
            `${LOG} join deferred user=${job.user_id} room=${waitingRoomId} reason=room_full validUntil=${validUntil?.toISOString() ?? "none"}`
          );
          await deferRoundJoin(client, job.id, "room_full");
          return { kind: "deferred", reason: "room_full" };
        }
        throw error;
      }
    } else {
      await client.query(
        `SELECT room_id, ticket_ids
           FROM game_core.fn_system_join_or_create_room($1::uuid, $2::uuid, $3::integer, NULL)`,
        [job.user_id, job.template_id, cardCount]
      );
    }

    await client.query("COMMIT");
    console.log(
      `${LOG} join ok user=${job.user_id} template=${job.template_id} cards=${cardCount} room=${waitingRoomId ?? "created"}`
    );
    return { kind: "done" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
