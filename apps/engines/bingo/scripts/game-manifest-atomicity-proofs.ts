#!/usr/bin/env node
/**
 * Catalog + fail-closed checks for game_manifests promote trigger.
 * Optional: DATABASE_URL txn that rolls back (no durable writes).
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
        WHERE c.relname = 'rooms'
          AND t.tgname = 'trg_game_manifest_on_room_status'
          AND NOT t.tgisinternal`
    );
    if (trig.rowCount !== 1) {
      throw new Error("missing trg_game_manifest_on_room_status");
    }

    const fn = await client.query(
      `SELECT proname FROM pg_proc
        WHERE pronamespace = 'game_core'::regnamespace
          AND proname IN ('fn_insert_game_manifest', 'fn_enqueue_game_replay_job')
        ORDER BY 1`
    );
    if ((fn.rowCount ?? 0) < 2) {
      throw new Error("missing game_core manifest functions");
    }

    const noUpd = await client.query(
      `SELECT t.tgname FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'game_manifests'
          AND t.tgname = 'trg_game_manifests_no_update'`
    );
    if (noUpd.rowCount !== 1) {
      throw new Error("missing immutable UPDATE trigger on game_manifests");
    }

    console.log("PASS catalog: promote trigger, insert fn, immutable manifests");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
