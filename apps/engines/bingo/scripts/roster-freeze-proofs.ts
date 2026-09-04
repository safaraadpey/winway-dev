#!/usr/bin/env node
/**
 * Fail-closed catalog checks for waiting-only ticket insert + promote lock.
 * Optional live txn is rolled back (no durable writes).
 */
import "dotenv/config";
import pg from "pg";

const DB =
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.POSTGRES_URL;

if (!DB) {
  console.error("Missing DATABASE_URL");
  process.exit(2);
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const trig = await client.query<{ tgname: string }>(
      `SELECT t.tgname
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'tickets'
          AND t.tgname = 'trg_tickets_waiting_only'
          AND NOT t.tgisinternal`
    );
    if (trig.rowCount !== 1) {
      throw new Error("missing trg_tickets_waiting_only");
    }

    const fns = await client.query(
      `SELECT proname FROM pg_proc
        WHERE pronamespace = 'game_core'::regnamespace
          AND proname IN (
            'fn_lock_room_if_waiting',
            'fn_pick_and_lock_waiting_room',
            'fn_tickets_waiting_only'
          )
        ORDER BY 1`
    );
    if ((fns.rowCount ?? 0) < 3) {
      throw new Error("missing roster freeze helpers");
    }

    const joinSrc = await client.query<{ src: string }>(
      `SELECT pg_get_functiondef('game_core.fn_join_or_create_room_core(uuid,integer,text)'::regprocedure) AS src`
    );
    if (!joinSrc.rows[0]?.src.includes("fn_pick_and_lock_waiting_room")) {
      throw new Error("fn_join_or_create_room_core is not lock-patched");
    }

    await client.query("BEGIN");
    try {
      const room = await client.query<{ id: string }>(
        `SELECT id FROM public.rooms WHERE status = 'playing' LIMIT 1`
      );
      if (room.rows[0]) {
        let refused = false;
        try {
          await client.query(
            `INSERT INTO public.tickets (
               id, room_id, player_user_id, pool_card_id, card_no,
               reservation_status, price, created_at, updated_at
             ) VALUES (
               gen_random_uuid(), $1, $2, 1, 1,
               'reserved', 0, now(), now()
             )`,
            [
              room.rows[0].id,
              (
                await client.query<{ id: string }>(
                  `SELECT id FROM public.users LIMIT 1`
                )
              ).rows[0]?.id,
            ]
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          refused = message.includes("ticket_insert_refused");
        }
        if (!refused) {
          throw new Error("expected ticket insert on playing room to be refused");
        }
      }
    } finally {
      await client.query("ROLLBACK");
    }

    console.log("[RosterFreeze] proofs ok");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
