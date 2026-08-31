import type { PoolClient } from "pg";
import type { RunContext } from "./types.js";
import { numbersSequenceHash } from "./hash.js";
import { sanitizeRoomForArchive } from "./sanitize.js";
import { bumpInserted, bumpRead, bumpSkipped } from "./runControl.js";

function json(row: Record<string, unknown>): string {
  return JSON.stringify(row);
}

export async function copyGameArchive(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  await copyNewCardPools(ctx, prod, backup);
  await copyTerminalRooms(ctx, prod, backup);
  await copyTournaments(ctx, prod, backup);
  await copyPlatformSessions(ctx, prod, backup);
  await copySeedReveals(ctx, prod, backup);
}

async function copyNewCardPools(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  const sourceKey = "game.card_pools";
  const { rows: pools } = await prod.query<Record<string, unknown>>(
    `SELECT * FROM public.card_pools`
  );
  const { rows: archived } = await backup.query<{ pool_id: string; version: number }>(
    `SELECT pool_id, version FROM archive.game_card_pools`
  );
  const archivedSet = new Set(archived.map((a) => `${a.pool_id}:${a.version}`));
  const missing = pools.filter(
    (p) => !archivedSet.has(`${String(p.id)}:${String(p.version)}`)
  );

  bumpRead(ctx, sourceKey, missing.length);
  for (const pool of missing) {
    const ins = await backup.query(
      `INSERT INTO archive.game_card_pools (
         pool_id, version, commit_hash, pool_seed, prng_version, card_count, source_row, first_run_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       ON CONFLICT (pool_id, version) DO NOTHING`,
      [
        pool.id,
        pool.version,
        pool.commit_hash,
        pool.pool_seed,
        pool.prng_version,
        pool.card_count,
        json(pool),
        ctx.runId,
      ]
    );
    if ((ins.rowCount ?? 0) > 0) {
      bumpInserted(ctx, sourceKey, 1);
      const { rows: cards } = await prod.query<Record<string, unknown>>(
        `SELECT * FROM public.card_pool_cards WHERE pool_id = $1`,
        [pool.id]
      );
      for (const card of cards) {
        await backup.query(
          `INSERT INTO archive.game_card_pool_cards (
             pool_card_id, pool_id, card_no, card_data, source_row, first_run_id
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
           ON CONFLICT (pool_card_id) DO NOTHING`,
          [card.id, card.pool_id, card.card_no, card.card_data, json(card), ctx.runId]
        );
      }
      const { rows: numbers } = await prod.query<Record<string, unknown>>(
        `SELECT cn.* FROM public.card_numbers cn
         JOIN public.card_pool_cards cpc ON cpc.id = cn.pool_card_id
         WHERE cpc.pool_id = $1`,
        [pool.id]
      );
      for (const num of numbers) {
        await backup.query(
          `INSERT INTO archive.game_card_numbers (
             pool_card_id, row_no, col_no, value, bit_position, source_row, first_run_id
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
           ON CONFLICT (pool_card_id, row_no, col_no) DO NOTHING`,
          [
            num.pool_card_id,
            num.row_no,
            num.col_no,
            num.value,
            num.bit_position,
            json(num),
            ctx.runId,
          ]
        );
      }
    } else {
      bumpSkipped(ctx, sourceKey, 1);
    }
  }
}

async function copyTerminalRooms(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  const sourceKey = "game.rooms";
  const { rows: archivedRows } = await backup.query<{ room_id: string }>(
    `SELECT room_id FROM archive.game_rooms`
  );
  const archivedSet = new Set(archivedRows.map((r) => r.room_id));
  let offset = 0;

  for (;;) {
    const { rows: allRooms } = await prod.query<Record<string, unknown>>(
      `SELECT r.* FROM public.rooms r
       WHERE r.status IN ('finished', 'cancelled')
         AND r.created_at <= $1
       ORDER BY r.created_at, r.id
       LIMIT $2 OFFSET $3`,
      [ctx.readAsOf, ctx.batchSize, offset]
    );

    if (allRooms.length === 0) break;

    const rooms = allRooms.filter((r) => !archivedSet.has(String(r.id)));
    bumpRead(ctx, sourceKey, rooms.length);

    for (const room of rooms) {
      const roomId = room.id as string;
      const sanitized = sanitizeRoomForArchive(room);

      const roomIns = await backup.query(
        `INSERT INTO archive.game_rooms (
           room_id, room_code, status, card_price, price, currency, commission_rate,
           line_prize_pool, full_prize_pool, line_reward_percentage, full_reward_percentage,
           ding_per_number, room_template_id, pool_id, starts_at, ends_at, created_at,
           cancelled_at, cancelled_by, cancelled_reason, prize_paid_at, first_line_draw_number,
           room_seed_hash, source_row, first_run_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25
         ) ON CONFLICT (room_id) DO NOTHING`,
        [
          roomId,
          room.room_code,
          room.status,
          room.card_price,
          room.price,
          room.currency,
          room.commission_rate,
          room.line_prize_pool,
          room.full_prize_pool,
          room.line_reward_percentage,
          room.full_reward_percentage,
          room.ding_per_number,
          room.room_template_id,
          room.pool_id,
          room.starts_at,
          room.ends_at,
          room.created_at,
          room.cancelled_at,
          room.cancelled_by,
          room.cancelled_reason,
          room.prize_paid_at,
          room.first_line_draw_number,
          room.room_seed_hash,
          json(sanitized),
          ctx.runId,
        ]
      );

      if ((roomIns.rowCount ?? 0) === 0) {
        bumpSkipped(ctx, sourceKey, 1);
        continue;
      }
      bumpInserted(ctx, sourceKey, 1);

      const { rows: drawAgg } = await prod.query<{
        numbers: number[];
        drawn_at: Date[];
      }>(
        `SELECT array_agg(number ORDER BY timestamp, id) AS numbers,
                array_agg(timestamp ORDER BY timestamp, id) AS drawn_at
         FROM public.draws WHERE room_id = $1`,
        [roomId]
      );

      const numbers = drawAgg[0]?.numbers ?? [];
      const drawnAt = drawAgg[0]?.drawn_at ?? [];
      const nHash = numbersSequenceHash(numbers);

      await backup.query(
        `INSERT INTO archive.game_room_draws (
           room_id, numbers, drawn_at, draw_count, first_drawn_at, last_drawn_at,
           numbers_hash, first_run_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (room_id) DO NOTHING`,
        [
          roomId,
          numbers,
          drawnAt,
          numbers.length,
          drawnAt[0] ?? null,
          drawnAt[drawnAt.length - 1] ?? null,
          nHash,
          ctx.runId,
        ]
      );

      const { rows: tickets } = await prod.query<Record<string, unknown>>(
        `SELECT * FROM public.tickets WHERE room_id = $1`,
        [roomId]
      );
      for (const t of tickets) {
        await backup.query(
          `INSERT INTO archive.game_tickets (
             ticket_id, room_id, player_user_id, pool_card_id, card_no, price,
             reservation_status, cancelled_at, transaction_id, source_row, first_run_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
           ON CONFLICT (ticket_id) DO NOTHING`,
          [
            t.id,
            t.room_id,
            t.player_user_id,
            t.pool_card_id,
            t.card_no,
            t.price,
            t.reservation_status,
            t.cancelled_at,
            t.transaction_id,
            json(t),
            ctx.runId,
          ]
        );
      }

      const { rows: results } = await prod.query<Record<string, unknown>>(
        `SELECT * FROM public.results WHERE room_id = $1`,
        [roomId]
      );
      for (const r of results) {
        await backup.query(
          `INSERT INTO archive.game_results (
             result_id, room_id, user_id, ticket_id, win_type, reward_amount,
             draw_number, paid_at, source_row, first_run_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
           ON CONFLICT (result_id) DO NOTHING`,
          [
            r.id,
            r.room_id,
            r.user_id,
            r.ticket_id,
            r.win_type,
            r.reward_amount,
            r.draw_number,
            r.paid_at,
            json(r),
            ctx.runId,
          ]
        );
      }

      const { rows: winners } = await prod.query<Record<string, unknown>>(
        `SELECT * FROM public.room_winners WHERE room_id = $1`,
        [roomId]
      );
      for (const w of winners) {
        await backup.query(
          `INSERT INTO archive.game_room_winners (
             room_id, ticket_id, user_id, weight, first_run_id
           ) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (room_id, ticket_id) DO NOTHING`,
          [w.room_id, w.ticket_id, w.user_id, w.weight, ctx.runId]
        );
      }
    }

    offset += allRooms.length;
    if (allRooms.length < ctx.batchSize) break;
  }
}

async function copyTournaments(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  const sourceKey = "game.tournaments";
  const { rows } = await prod.query<Record<string, unknown>>(
    `SELECT * FROM public.tournaments WHERE created_at <= $1`,
    [ctx.readAsOf]
  );
  bumpRead(ctx, sourceKey, rows.length);
  for (const row of rows) {
    const result = await backup.query(
      `INSERT INTO archive.game_tournaments (
         tournament_id, title, status, start_at, currency, ticket_price, commission_rate,
         guaranteed_prize, watch_code, source_row, first_run_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
       ON CONFLICT (tournament_id) DO NOTHING`,
      [
        row.id,
        row.title,
        row.status,
        row.start_at,
        row.currency,
        row.ticket_price,
        row.commission_rate,
        row.guaranteed_prize,
        row.watch_code,
        json(row),
        ctx.runId,
      ]
    );
    if ((result.rowCount ?? 0) > 0) bumpInserted(ctx, sourceKey, 1);
    else bumpSkipped(ctx, sourceKey, 1);
  }

  const { rows: roundRooms } = await prod.query<Record<string, unknown>>(
    `SELECT * FROM public.tournament_round_rooms`
  );
  for (const rr of roundRooms) {
    await backup.query(
      `INSERT INTO archive.game_tournament_round_rooms (
         source_id, tournament_id, round_no, table_no, room_id, status, source_row, first_run_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       ON CONFLICT (source_id) DO NOTHING`,
      [
        rr.id,
        rr.tournament_id,
        rr.round_no,
        rr.table_no,
        rr.room_id,
        rr.status,
        json(rr),
        ctx.runId,
      ]
    );
  }

  const { rows: assignments } = await prod.query<Record<string, unknown>>(
    `SELECT * FROM public.tournament_round_assignments`
  );
  for (const a of assignments) {
    await backup.query(
      `INSERT INTO archive.game_tournament_round_assignments (
         tournament_id, round_no, user_id, room_id, seed, cards_count, source_row, first_run_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       ON CONFLICT (tournament_id, round_no, user_id, room_id) DO NOTHING`,
      [
        a.tournament_id,
        a.round_no,
        a.user_id,
        a.room_id,
        a.seed,
        a.cards_count,
        json(a),
        ctx.runId,
      ]
    );
  }
}

async function copyPlatformSessions(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  const sourceKey = "game.sessions";
  const { rows } = await prod.query<Record<string, unknown>>(
    `SELECT id, game_id, status, entry_fee, currency, participant_count,
            created_at, started_at, finished_at, settled_at, updated_at
     FROM platform.game_sessions WHERE created_at <= $1`,
    [ctx.readAsOf]
  );
  bumpRead(ctx, sourceKey, rows.length);
  for (const row of rows) {
    const result = await backup.query(
      `INSERT INTO archive.game_sessions (
         session_id, game_id, status, entry_fee, currency, participant_count,
         created_at, started_at, finished_at, settled_at, source_row, first_run_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       ON CONFLICT (session_id) DO NOTHING`,
      [
        row.id,
        row.game_id,
        row.status,
        row.entry_fee,
        row.currency,
        row.participant_count,
        row.created_at,
        row.started_at,
        row.finished_at,
        row.settled_at,
        json(row),
        ctx.runId,
      ]
    );
    if ((result.rowCount ?? 0) > 0) bumpInserted(ctx, sourceKey, 1);
    else bumpSkipped(ctx, sourceKey, 1);

    const { rows: parts } = await prod.query<Record<string, unknown>>(
      `SELECT id, session_id, user_id, seat_no, status, ticket_count, amount_total, joined_at, left_at
       FROM platform.session_participants WHERE session_id = $1`,
      [row.id]
    );
    for (const p of parts) {
      await backup.query(
        `INSERT INTO archive.game_session_participants (
           session_id, user_id, seat_no, status, ticket_count, amount_total,
           joined_at, left_at, source_row, first_run_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
         ON CONFLICT (session_id, user_id) DO NOTHING`,
        [
          p.session_id,
          p.user_id,
          p.seat_no,
          p.status,
          p.ticket_count,
          p.amount_total,
          p.joined_at,
          p.left_at,
          json(p),
          ctx.runId,
        ]
      );
    }
  }
}

async function copySeedReveals(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  const sourceKey = "game.room_seed_reveals";
  const { rows: archived } = await backup.query<{ room_id: string }>(
    `SELECT room_id FROM archive.game_room_seed_reveals`
  );
  const archivedSet = new Set(archived.map((r) => r.room_id));

  const { rows: allRows } = await prod.query<Record<string, unknown>>(
    `SELECT id, room_seed, seed_revealed_at FROM public.rooms
     WHERE seed_revealed_at IS NOT NULL AND seed_revealed_at <= $1`,
    [ctx.readAsOf]
  );
  const rows = allRows.filter((r) => !archivedSet.has(String(r.id)));
  bumpRead(ctx, sourceKey, rows.length);
  for (const row of rows) {
    const result = await backup.query(
      `INSERT INTO archive.game_room_seed_reveals (
         room_id, room_seed, seed_revealed_at, first_run_id
       ) VALUES ($1,$2,$3,$4)
       ON CONFLICT (room_id) DO NOTHING`,
      [row.id, row.room_seed, row.seed_revealed_at, ctx.runId]
    );
    if ((result.rowCount ?? 0) > 0) bumpInserted(ctx, sourceKey, 1);
    else bumpSkipped(ctx, sourceKey, 1);
  }
}
