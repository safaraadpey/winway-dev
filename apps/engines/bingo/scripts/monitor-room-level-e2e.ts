#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const roomId = process.argv[2] ?? "7a6afa2e-2c77-4939-82b9-aeec3f24fd49";
const DB = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;

async function snapshot(client: pg.Client) {
  const res = await client.query(
    `SELECT r.room_code, r.status, r.ding_settle_mode, r.ding_settled_at, r.prize_paid_at,
            r.ding_settlement_key, r.ding_settlement_version,
            (SELECT COUNT(*) FROM public.ding_apply_jobs j WHERE j.room_id = r.id) AS ding_jobs,
            (SELECT COUNT(*) FROM public.ding_apply_jobs j WHERE j.room_id = r.id AND j.status <> 'done') AS ding_jobs_active,
            (SELECT COUNT(*) FROM public.ding_transactions dt WHERE dt.room_id = r.id AND dt.drawn_number BETWEEN 1 AND 90) AS per_draw_tx,
            (SELECT COUNT(*) FROM public.ding_transactions dt WHERE dt.room_id = r.id AND dt.drawn_number = 0) AS room_level_tx,
            (SELECT COALESCE(SUM(dt.amount),0) FROM public.ding_transactions dt WHERE dt.room_id = r.id AND dt.drawn_number = 0) AS room_level_ding_total,
            (SELECT COUNT(*) FROM public.draws d WHERE d.room_id = r.id) AS draws,
            (SELECT COUNT(*) FROM public.results res WHERE res.room_id = r.id AND res.win_type = 'full') AS full_winners,
            (SELECT COUNT(*) FROM public.tickets t WHERE t.room_id = r.id AND t.reservation_status = 'consumed') AS tickets_consumed
     FROM public.rooms r
     WHERE r.id = $1`,
    [roomId]
  );
  return res.rows[0] as Record<string, unknown>;
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (let i = 0; i < 60; i++) {
      const s = await snapshot(client);
      console.log(JSON.stringify({ ts: new Date().toISOString(), ...s }));
      const status = String(s.status);
      if (status === "finished" || status === "cancelled") break;
      await new Promise((r) => setTimeout(r, 15000));
    }
    const final = await snapshot(client);
    console.log("FINAL", JSON.stringify(final, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
