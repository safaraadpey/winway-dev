import { query } from "../../db.mjs";
import { drainUntilMirrored } from "../../validate/shadowParity.mjs";

const HARNESS_LEASE = "shadow-regression-harness";

/**
 * Create a synthetic Bingo room (triggers shadow enqueue). Does not touch wallets.
 * Production CHECK room_pool_required_chk: waiting|playing|settling require pool_id NOT NULL.
 * @param {{ label?: string, poolId?: string|null, playerCount?: number }} [opts]
 */
export async function createHarnessRoom(opts = {}) {
  const label = opts.label || "shadow-regression";
  const poolId = opts.poolId ?? (await getAnyPoolId());
  if (!poolId) {
    throw new Error(
      "createHarnessRoom: no card_pools row available; room_pool_required_chk requires pool_id for waiting rooms"
    );
  }

  const { rows } = await query(
    `INSERT INTO public.rooms (
       status, card_price, currency, max_cards_per_player,
       line_prize_pool, full_prize_pool, pool_id,
       engine_loop_state, engine_lease_epoch
     ) VALUES (
       'waiting'::public.room_status, 0, 'IRR', 10,
       0, 0, $1::uuid,
       'idle', 0
     )
     RETURNING id, status::text AS status, created_at, pool_id`,
    [poolId]
  );
  const room = rows[0];

  // Annotate via session event after mirror; also stamp lease owner empty.
  await query(
    `UPDATE public.rooms SET updated_at = now() WHERE id = $1`,
    [room.id]
  );

  return {
    roomId: room.id,
    label,
    status: room.status,
    poolId: room.pool_id,
  };
}

/**
 * @param {string} roomId
 * @param {string} status - waiting|playing|settling|finished|cancelled|idle
 * @param {{ lease?: boolean, leaseOwner?: string|null }} [opts]
 */
export async function setRoomLifecycle(roomId, status, opts = {}) {
  const lease = opts.lease === true;
  const owner = lease ? opts.leaseOwner || HARNESS_LEASE : null;
  const until = lease ? new Date(Date.now() + 60_000).toISOString() : null;
  const epochInc = lease ? 1 : 0;

  await query(
    `UPDATE public.rooms SET
       status = $2::public.room_status,
       engine_owner_id = $3,
       engine_lease_until = $4::timestamptz,
       engine_lease_epoch = CASE WHEN $5 > 0 THEN engine_lease_epoch + $5 ELSE engine_lease_epoch END,
       updated_at = now()
     WHERE id = $1`,
    [roomId, status, owner, until, epochInc]
  );
}

/**
 * Drive Created→Waiting→Claimed→Running→Finished→Settled (Bingo finished).
 * @param {string} roomId
 * @param {{ earlyFinish?: boolean }} [opts]
 */
export async function driveFullLifecycle(roomId, opts = {}) {
  await setRoomLifecycle(roomId, "waiting", { lease: false });
  await drainUntilMirrored(roomId, { waitMs: 5000 });

  await setRoomLifecycle(roomId, "waiting", { lease: true });
  await drainUntilMirrored(roomId, { waitMs: 5000 });

  await setRoomLifecycle(roomId, "playing", { lease: true });
  await drainUntilMirrored(roomId, { waitMs: 5000 });

  if (!opts.earlyFinish) {
    // linger in running (late winner path)
    await sleep(50);
  }

  await setRoomLifecycle(roomId, "settling", { lease: true });
  await drainUntilMirrored(roomId, { waitMs: 5000 });

  await setRoomLifecycle(roomId, "finished", { lease: false });
  await drainUntilMirrored(roomId, { waitMs: 8000 });
}

/**
 * Insert synthetic win rows (requires tickets). Soft-no-op if tickets missing.
 * @param {string} roomId
 * @param {{ winType: 'line'|'full', count: number }} spec
 */
export async function seedWinners(roomId, spec) {
  const tickets = await query(
    `SELECT id, player_user_id FROM public.tickets WHERE room_id = $1 LIMIT $2`,
    [roomId, spec.count]
  );
  if (tickets.rows.length < spec.count) {
    return { seeded: 0, reason: "insufficient_tickets" };
  }
  let n = 0;
  for (const t of tickets.rows) {
    await query(
      `INSERT INTO public.results (room_id, user_id, ticket_id, win_type, reward_amount, draw_number)
       VALUES ($1, $2, $3, $4, 0, $5)`,
      [roomId, t.player_user_id, t.id, spec.winType, spec.winType === "line" ? 15 : 75]
    ).catch(() => {
      /* ignore duplicate/constraint */
    });
    n += 1;
  }
  return { seeded: n };
}

/**
 * Attach N distinct users as participants on Platform only (documents expected future mirror).
 * Also tries to create tickets when pool cards available.
 * @param {string} roomId
 * @param {number} playerCount
 */
export async function attachPlayers(roomId, playerCount) {
  const users = await query(
    `SELECT id FROM public.users WHERE status::text = 'active' ORDER BY created_at DESC NULLS LAST LIMIT $1`,
    [playerCount]
  );
  if (users.rows.length < playerCount) {
    return { attached: 0, reason: "insufficient_users" };
  }

  const cards = await query(
    `SELECT id, card_no FROM public.card_pool_cards ORDER BY card_no ASC LIMIT $1`,
    [playerCount]
  );

  let tickets = 0;
  for (let i = 0; i < playerCount; i++) {
    const userId = users.rows[i].id;
    if (cards.rows[i]) {
      try {
        await query(
          `INSERT INTO public.tickets (
             room_id, player_user_id, pool_card_id, card_no, price,
             reservation_status, is_verified_win
           ) VALUES (
             $1, $2, $3, $4, 0,
             'confirmed'::public.reservation_status, false
           )`,
          [roomId, userId, cards.rows[i].id, cards.rows[i].card_no]
        );
        tickets += 1;
      } catch {
        // ticket insert may fail on enum/constraints — continue
      }
    }
    await query(
      `INSERT INTO platform.session_participants (session_id, user_id, seat_no, status)
       VALUES ($1, $2, $3, 'joined')
       ON CONFLICT (session_id, user_id) DO NOTHING`,
      [roomId, userId, i]
    ).catch(() => {});
  }
  return { attached: users.rows.length, tickets };
}

export async function cancelHarnessRoom(roomId) {
  await query(
    `UPDATE public.rooms SET status = 'cancelled'::public.room_status, engine_owner_id = NULL,
       engine_lease_until = NULL, updated_at = now() WHERE id = $1`,
    [roomId]
  );
  await query(`SELECT platform.fn_shadow_enqueue($1::uuid)`, [roomId]);
  await query(`SELECT platform.fn_shadow_drain(50)`);
}

export async function forceEnqueue(roomId) {
  await query(`SELECT platform.fn_shadow_enqueue($1::uuid)`, [roomId]);
}

export async function forceDrain(limit = 100) {
  const { rows } = await query(`SELECT platform.fn_shadow_drain($1::int) AS r`, [limit]);
  return rows[0]?.r;
}

export async function delayPendingOutbox(roomId, delaySeconds) {
  await query(
    `UPDATE platform.shadow_outbox
     SET next_attempt_at = now() + make_interval(secs => $2),
         processed_at = NULL,
         dead_lettered_at = NULL
     WHERE room_id = $1 AND processed_at IS NULL`,
    [roomId, delaySeconds]
  );
}

export async function getPoolCardCount() {
  const { rows } = await query(`SELECT count(*)::int AS n FROM public.card_pool_cards`);
  return rows[0]?.n ?? 0;
}

export async function getAnyPoolId() {
  const { rows } = await query(`SELECT id FROM public.card_pools ORDER BY created_at DESC NULLS LAST LIMIT 1`);
  return rows[0]?.id ?? null;
}

export async function findTournamentRoom() {
  const viaRound = await query(
    `SELECT room_id AS id FROM public.tournament_round_rooms
     ORDER BY created_at DESC NULLS LAST LIMIT 1`
  ).catch(() => ({ rows: [] }));
  if (viaRound.rows[0]?.id) return viaRound.rows[0].id;

  const fin = await query(
    `SELECT id FROM public.rooms WHERE status::text = 'finished' ORDER BY updated_at DESC LIMIT 1`
  );
  return fin.rows[0]?.id ?? null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
