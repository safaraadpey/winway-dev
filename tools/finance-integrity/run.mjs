/**
 * P6.4 monetary integrity regression suite (deterministic, against DEV DB).
 * Usage: node tools/finance-integrity/run.mjs
 */
import crypto from "crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const ADMIN_ID = "e41e9a09-920d-4eff-89cb-bacc842537ad";
const PLAYER_ID = "1ce95614-89fd-4e01-b454-bd4c462f2b93"; // babak under admin
const AMOUNT = 1n;

let passed = 0;
let failed = 0;

function assert(cond, name, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function rid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function withActor(pool, actorId, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', $1, true)`,
      [actorId]
    );
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function balance(pool, userId) {
  const { rows } = await pool.query(
    `SELECT balance::bigint AS balance FROM wallets WHERE user_id = $1 AND currency = 'IRR'`,
    [userId]
  );
  return BigInt(rows[0]?.balance ?? 0);
}

async function transfer(pool, actorId, targetId, amount, action, clientRequestId) {
  return withActor(pool, actorId, async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM public.fn_wallet_transfer_panel($1, $2, $3, $4, $5, $6::jsonb)`,
      [targetId, amount.toString(), action, clientRequestId, "p6.4 regression", {}]
    );
    return rows[0];
  });
}

async function applyDelta(pool, userId, delta, type, key) {
  const { rows } = await pool.query(
    `SELECT public.fn_wallet_apply_delta(
       $1::uuid, 'IRR', $2::numeric, $3::transaction_type,
       'manual_panel', $4::text, 'p6.4 regression', '{}'::jsonb, false, $5::text
     ) AS id`,
    [userId, delta.toString(), type, ADMIN_ID, key]
  );
  return rows[0].id;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 8,
  });

  console.log("\nP6.4 finance integrity regressions\n");

  // --- 1) duplicate transfer ---
  {
    console.log("1) duplicate transfer");
    const req = rid("xfer");
    const balBeforeAdmin = await balance(pool, ADMIN_ID);
    const balBeforePlayer = await balance(pool, PLAYER_ID);

    const first = await transfer(pool, ADMIN_ID, PLAYER_ID, AMOUNT, "deposit", req);
    const midAdmin = await balance(pool, ADMIN_ID);
    const midPlayer = await balance(pool, PLAYER_ID);

    const second = await transfer(pool, ADMIN_ID, PLAYER_ID, AMOUNT, "deposit", req);
    const afterAdmin = await balance(pool, ADMIN_ID);
    const afterPlayer = await balance(pool, PLAYER_ID);

    assert(first.replayed === false, "first transfer not replayed");
    assert(second.replayed === true, "second transfer replayed");
    assert(
      String(first.transfer_id) === String(second.transfer_id),
      "same transfer_id on replay"
    );
    assert(
      midAdmin === balBeforeAdmin - AMOUNT && afterAdmin === midAdmin,
      "admin balance moved once"
    );
    assert(
      midPlayer === balBeforePlayer + AMOUNT && afterPlayer === midPlayer,
      "player balance moved once"
    );

    // reverse
    await transfer(
      pool,
      ADMIN_ID,
      PLAYER_ID,
      AMOUNT,
      "withdraw",
      rid("xfer_rev")
    );
  }

  // --- 2) same id different payload ---
  {
    console.log("2) transfer payload mismatch");
    const req = rid("xfer_mm");
    await transfer(pool, ADMIN_ID, PLAYER_ID, AMOUNT, "deposit", req);
    let mismatch = false;
    try {
      await transfer(pool, ADMIN_ID, PLAYER_ID, 2n, "deposit", req);
    } catch (e) {
      mismatch = String(e.message).includes("idempotency_payload_mismatch");
    }
    assert(mismatch, "rejects same id with different amount");
    await transfer(
      pool,
      ADMIN_ID,
      PLAYER_ID,
      AMOUNT,
      "withdraw",
      rid("xfer_mm_rev")
    );
  }

  // --- 3) apply_delta duplicate ---
  {
    console.log("3) duplicate apply_delta");
    const key = rid("adj");
    const before = await balance(pool, PLAYER_ID);
    const id1 = await applyDelta(pool, PLAYER_ID, 1, "deposit", key);
    const mid = await balance(pool, PLAYER_ID);
    const id2 = await applyDelta(pool, PLAYER_ID, 1, "deposit", key);
    const after = await balance(pool, PLAYER_ID);
    assert(String(id1) === String(id2), "apply_delta returns same tx id");
    assert(mid === before + 1n && after === mid, "apply_delta moved once");

    let mismatch = false;
    try {
      await applyDelta(pool, PLAYER_ID, 2, "deposit", key);
    } catch (e) {
      mismatch = String(e.message).includes("idempotency_payload_mismatch");
    }
    assert(mismatch, "apply_delta rejects key with different amount");

    await applyDelta(pool, PLAYER_ID, -1, "withdraw", rid("adj_rev"));
  }

  // --- 4) concurrent same request id ---
  {
    console.log("4) concurrent identical transfer request");
    const req = rid("xfer_conc");
    const beforeAdmin = await balance(pool, ADMIN_ID);
    const beforePlayer = await balance(pool, PLAYER_ID);

    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        transfer(pool, ADMIN_ID, PLAYER_ID, AMOUNT, "deposit", req).catch(
          (e) => ({ error: e.message })
        )
      )
    );

    const oks = results.filter((r) => r && r.transfer_id && !r.error);
    const transferIds = new Set(oks.map((r) => String(r.transfer_id)));
    const afterAdmin = await balance(pool, ADMIN_ID);
    const afterPlayer = await balance(pool, PLAYER_ID);

    assert(oks.length === 4, "all concurrent calls succeed or replay", JSON.stringify(results));
    assert(transferIds.size === 1, "single transfer_id under concurrency");
    assert(
      afterAdmin === beforeAdmin - AMOUNT && afterPlayer === beforePlayer + AMOUNT,
      "money moved exactly once under concurrency"
    );

    await transfer(
      pool,
      ADMIN_ID,
      PLAYER_ID,
      AMOUNT,
      "withdraw",
      rid("xfer_conc_rev")
    );
  }

  // --- 5) deadlock avoidance (cross direction ordered locks) ---
  {
    console.log("5) concurrent opposite transfers (deadlock avoidance)");
    // Seed player so withdraw path has funds
    await transfer(pool, ADMIN_ID, PLAYER_ID, 5n, "deposit", rid("seed"));
    const beforeAdmin = await balance(pool, ADMIN_ID);
    const beforePlayer = await balance(pool, PLAYER_ID);

    let deadlock = false;
    let errors = [];
    try {
      await Promise.all([
        transfer(pool, ADMIN_ID, PLAYER_ID, AMOUNT, "deposit", rid("dl_a")),
        transfer(pool, ADMIN_ID, PLAYER_ID, AMOUNT, "withdraw", rid("dl_b")),
        transfer(pool, ADMIN_ID, PLAYER_ID, AMOUNT, "deposit", rid("dl_c")),
        transfer(pool, ADMIN_ID, PLAYER_ID, AMOUNT, "withdraw", rid("dl_d")),
      ]);
    } catch (e) {
      const msg = String(e.message || e);
      errors.push(msg);
      deadlock = msg.toLowerCase().includes("deadlock");
    }

    assert(!deadlock, "no deadlock detected", errors.join("; "));
    const afterAdmin = await balance(pool, ADMIN_ID);
    const afterPlayer = await balance(pool, PLAYER_ID);
    // net: +1+1-1-1 = 0 relative to after seed; seed was +5
    assert(
      afterAdmin === beforeAdmin && afterPlayer === beforePlayer,
      "opposite concurrent transfers net zero"
    );

    await transfer(pool, ADMIN_ID, PLAYER_ID, 5n, "withdraw", rid("seed_rev"));
  }

  // --- 6) wallet == ledger (local invariant + recon reports) ---
  {
    console.log("6) wallet == ledger");
    const key = rid("wl");
    const before = await balance(pool, PLAYER_ID);
    await applyDelta(pool, PLAYER_ID, 3, "deposit", key);
    const after = await balance(pool, PLAYER_ID);
    assert(after === before + 3n, "apply_delta updates wallet balance");

    const { rows: projRows } = await pool.query(
      `
      SELECT t.balance_before::bigint AS bb, t.balance_after::bigint AS ba
      FROM transactions t WHERE t.idempotency_key = $1
      `,
      [key]
    );
    assert(
      BigInt(projRows[0].ba) - BigInt(projRows[0].bb) === 3n &&
        BigInt(projRows[0].ba) === after,
      "ledger balance_before/after matches wallet"
    );
    await applyDelta(pool, PLAYER_ID, -3, "withdraw", rid("wl_rev"));

    // Admin wallet historically consistent — projection must match
    const { rows: adminProj } = await pool.query(
      `
      SELECT w.balance::numeric AS balance,
             coalesce(sum(t.balance_after - t.balance_before), 0)::numeric AS projection
      FROM wallets w
      LEFT JOIN transactions t
        ON t.user_id = w.user_id AND t.currency = w.currency AND t.status = 'completed'
      WHERE w.user_id = $1 AND w.currency = 'IRR'
      GROUP BY w.balance
      `,
      [ADMIN_ID]
    );
    assert(
      Number(adminProj[0].balance) === Number(adminProj[0].projection),
      "admin wallet == ledger projection"
    );

    const { rows } = await pool.query(
      `SELECT public.fn_recon_wallet_ledger(50) AS r`
    );
    const r = rows[0].r;
    assert(typeof r.drift_count === "number", "recon returns drift_count");
    assert(Number(r.checked) > 0, "checked wallets > 0");
    assert(Array.isArray(r.drifts), "recon returns drifts array (alert-only)");
  }

  // --- 7) money conservation (internal transfers net 0) ---
  {
    console.log("7) money conservation");
    const { rows } = await pool.query(
      `SELECT public.fn_recon_money_conservation() AS r`
    );
    const r = rows[0].r;
    assert(r.transfers.ok === true, "Σ transfer_in == Σ transfer_out", `net=${r.transfers.net}`);
    assert(r.treasury_injection != null, "treasury injection reported");
    assert(r.game_cycle != null, "game cycle / room capture approx reported");
    assert(
      r.game_cycle.note && String(r.game_cycle.note).toLowerCase().includes("tournament"),
      "tournament guarantee noted separately in report"
    );
  }

  // --- 8) bulk retry (per-item idempotency) ---
  {
    console.log("8) bulk retry with same client_request_ids");
    const ids = [rid("bulk1"), rid("bulk2")];
    // Use same player twice would fail unique in one actor - use two players
    const p2 = "68a30803-b5c3-4c3d-a7da-860f54b78d2a"; // deep
    const targets = [PLAYER_ID, p2];
    const before = await Promise.all(targets.map((id) => balance(pool, id)));

    for (let i = 0; i < targets.length; i++) {
      await transfer(pool, ADMIN_ID, targets[i], AMOUNT, "deposit", ids[i]);
    }
    const mid = await Promise.all(targets.map((id) => balance(pool, id)));
    for (let i = 0; i < targets.length; i++) {
      const row = await transfer(
        pool,
        ADMIN_ID,
        targets[i],
        AMOUNT,
        "deposit",
        ids[i]
      );
      assert(row.replayed === true, `bulk item ${i} replayed on retry`);
    }
    const after = await Promise.all(targets.map((id) => balance(pool, id)));
    assert(
      mid.every((b, i) => b === before[i] + AMOUNT) &&
        after.every((b, i) => b === mid[i]),
      "bulk retry does not double-credit"
    );

    for (let i = 0; i < targets.length; i++) {
      await transfer(
        pool,
        ADMIN_ID,
        targets[i],
        AMOUNT,
        "withdraw",
        rid(`bulk_rev_${i}`)
      );
    }
  }

  // --- store combined report ---
  {
    console.log("9) recon store");
    const { rows } = await pool.query(
      `SELECT public.fn_recon_run_and_store() AS r`
    );
    assert(rows[0].r.report_id != null, "recon report stored");
  }

  await pool.end();

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
  console.log("P6_4_FINANCE_INTEGRITY_TESTS_PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
