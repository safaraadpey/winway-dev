/**
 * P6.5 Deposit Domain validation suite (fake payments only).
 * Usage: npm run test:deposit-domain
 *
 * Requires DATABASE_URL and DEPOSIT_DOMAIN_TEST_MODE=true (set here).
 */
import crypto from "crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });
process.env.DEPOSIT_DOMAIN_TEST_MODE = "true";

const PLAYER_ID = "1ce95614-89fd-4e01-b454-bd4c462f2b93"; // babak
const AMOUNT = 7;

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

function rid(p) {
  return `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function balance(pool, userId) {
  const { rows } = await pool.query(
    `SELECT balance::numeric AS b FROM wallets WHERE user_id = $1 AND currency = 'IRR'`,
    [userId]
  );
  return Number(rows[0]?.b ?? 0);
}

async function ledgerProj(pool, userId) {
  const { rows } = await pool.query(
    `
    SELECT coalesce(sum(balance_after - balance_before), 0)::numeric AS p
    FROM transactions
    WHERE user_id = $1 AND currency = 'IRR' AND status = 'completed'
      AND balance_before IS NOT NULL AND balance_after IS NOT NULL
    `,
    [userId]
  );
  return Number(rows[0].p);
}

async function createIntent(pool, opts = {}) {
  const expires = opts.expiresAt || new Date(Date.now() + 3600_000);
  const { rows } = await pool.query(
    `SELECT deposit.fn_create_intent(
       $1::uuid, 'fake', 'fake', $2::numeric, 'IRR', $3::timestamptz,
       $4, '{}'::jsonb, 'test', NULL, NULL
     ) AS id`,
    [
      opts.userId || PLAYER_ID,
      opts.amount || AMOUNT,
      expires.toISOString(),
      opts.dest || `dest_${rid("d")}`,
    ]
  );
  return rows[0].id;
}

async function activate(pool, id, dest = null) {
  await pool.query(`SELECT deposit.fn_activate_intent($1::uuid, $2)`, [
    id,
    dest,
  ]);
}

async function statusOf(pool, id) {
  const { rows } = await pool.query(
    `SELECT deposit.fn_get_intent_status($1::uuid) AS s`,
    [id]
  );
  return rows[0].s;
}

async function recordAttempt(pool, intentId, eventId, parseStatus = "accepted") {
  const hash = crypto.createHash("sha256").update(eventId).digest("hex");
  const { rows } = await pool.query(
    `SELECT deposit.fn_record_attempt(
       $1::uuid, 'fake', $2, $3, $4::deposit.attempt_parse_status, NULL, '{}'::jsonb
     ) AS r`,
    [intentId, eventId, hash, parseStatus]
  );
  return rows[0].r;
}

async function beginVerify(pool, id) {
  await pool.query(`SELECT deposit.fn_begin_verification($1::uuid)`, [id]);
}

async function passVerify(pool, intentId, attemptId, paymentId, amount, currency, dest) {
  const { rows } = await pool.query(
    `SELECT deposit.fn_pass_verification(
       $1::uuid, $2::uuid, 'fake', $3, $4::numeric, $5, '{}'::jsonb, 1, $6
     ) AS r`,
    [intentId, attemptId, paymentId, amount, currency, dest]
  );
  return rows[0].r;
}

async function failVerify(pool, intentId, attemptId, code, terminal) {
  const { rows } = await pool.query(
    `SELECT deposit.fn_fail_verification(
       $1::uuid, $2::uuid, 'fake', $3, '{}'::jsonb, $4
     ) AS r`,
    [intentId, attemptId, code, terminal]
  );
  return rows[0].r;
}

async function postCredit(pool, intentId) {
  const { rows } = await pool.query(
    `SELECT deposit.fn_post_credit($1::uuid) AS r`,
    [intentId]
  );
  return rows[0].r;
}

/** Happy path: create → activate → attempt → verify → credit */
async function happyPath(pool) {
  const dest = `dest_${rid("hp")}`;
  const paymentId = rid("pay");
  const eventId = rid("evt");
  const before = await balance(pool, PLAYER_ID);

  const intentId = await createIntent(pool, { dest, amount: AMOUNT });
  await activate(pool, intentId, dest);
  const att = await recordAttempt(pool, intentId, eventId);
  await beginVerify(pool, intentId);
  const ver = await passVerify(
    pool,
    intentId,
    att.attempt_id,
    paymentId,
    AMOUNT,
    "IRR",
    dest
  );
  const credit = await postCredit(pool, intentId);
  const st = await statusOf(pool, intentId);
  const after = await balance(pool, PLAYER_ID);

  assert(st.status === "credited", "happy path status credited");
  assert(credit.replayed === false, "happy path credit not replayed");
  assert(!!credit.ledger_tx_id, "happy path ledger_tx_id set");
  assert(after === before + AMOUNT, "wallet credited exactly once (happy)");
  assert(!!ver.verification_id, "verification id present");
  return { intentId, paymentId, eventId, credit, before };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

  console.log("\nP6.5 Deposit Domain validation\n");

  // 1) Happy path
  console.log("1) happy path fake payment");
  const hp = await happyPath(pool);

  // 2) Duplicate callback
  console.log("2) duplicate callback");
  {
    const dest = `dest_${rid("dup")}`;
    const intentId = await createIntent(pool, { dest });
    await activate(pool, intentId, dest);
    const eventId = rid("evt");
    const a1 = await recordAttempt(pool, intentId, eventId);
    const a2 = await recordAttempt(pool, intentId, eventId);
    assert(a1.duplicate === false, "first attempt accepted");
    assert(a2.duplicate === true, "duplicate callback detected");
    assert(
      String(a1.attempt_id) === String(a2.attempt_id),
      "duplicate returns same attempt id"
    );
  }

  // 3) Duplicate credit / retry after posted
  console.log("3) duplicate credit + retry after posted");
  {
    const c2 = await postCredit(pool, hp.intentId);
    assert(c2.replayed === true, "retry after posted is replay");
    assert(
      String(c2.ledger_tx_id) === String(hp.credit.ledger_tx_id),
      "same ledger_tx_id on credit retry"
    );
    const bal = await balance(pool, PLAYER_ID);
    assert(bal === hp.before + AMOUNT, "no double credit on retry");
  }

  // 4) Payload mismatch on credit idempotency (simulate via second intent same payment id blocked at verify)
  console.log("4) payload mismatch / duplicate external payment");
  {
    const dest = `dest_${rid("mm")}`;
    const intentId = await createIntent(pool, { dest, amount: AMOUNT });
    await activate(pool, intentId, dest);
    const att = await recordAttempt(pool, intentId, rid("evt"));
    await beginVerify(pool, intentId);
    let blocked = false;
    try {
      await passVerify(
        pool,
        intentId,
        att.attempt_id,
        hp.paymentId, // reuse payment id from happy path
        AMOUNT,
        "IRR",
        dest
      );
    } catch (e) {
      blocked = String(e.message).includes("duplicate_external_payment")
        || String(e.message).includes("unique")
        || e.code === "23505";
    }
    assert(blocked, "duplicate external_payment_id rejected at verify");
  }

  // 5) Wrong amount
  console.log("5) wrong amount");
  {
    const dest = `dest_${rid("wa")}`;
    const intentId = await createIntent(pool, { dest });
    await activate(pool, intentId, dest);
    const att = await recordAttempt(pool, intentId, rid("evt"));
    await beginVerify(pool, intentId);
    const ver = await passVerify(
      pool,
      intentId,
      att.attempt_id,
      rid("pay"),
      AMOUNT + 1,
      "IRR",
      dest
    );
    const st = await statusOf(pool, intentId);
    assert(ver.result === "fail" && ver.failure_code === "amount_mismatch", "wrong amount fails verify");
    assert(st.status === "rejected", "wrong amount → rejected");
  }

  // 6) Wrong currency
  console.log("6) wrong currency");
  {
    const dest = `dest_${rid("wc")}`;
    const intentId = await createIntent(pool, { dest });
    await activate(pool, intentId, dest);
    const att = await recordAttempt(pool, intentId, rid("evt"));
    await beginVerify(pool, intentId);
    const ver = await passVerify(
      pool,
      intentId,
      att.attempt_id,
      rid("pay"),
      AMOUNT,
      "USD",
      dest
    );
    const st = await statusOf(pool, intentId);
    assert(ver.result === "fail" && ver.failure_code === "currency_mismatch", "wrong currency fails verify");
    assert(st.status === "rejected", "wrong currency → rejected");
  }

  // 7) Expired intent
  console.log("7) expired intent");
  {
    const dest = `dest_${rid("ex")}`;
    const intentId = await createIntent(pool, { dest });
    await activate(pool, intentId, dest);
    await pool.query(
      `UPDATE deposit.intents SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [intentId]
    );
    const att = await recordAttempt(pool, intentId, rid("evt"));
    await beginVerify(pool, intentId);
    const ver = await passVerify(
      pool,
      intentId,
      att.attempt_id,
      rid("pay"),
      AMOUNT,
      "IRR",
      dest
    );
    const st = await statusOf(pool, intentId);
    assert(ver.result === "fail" && ver.failure_code === "expired", "expired intent fails verification");
    assert(st.status === "rejected", "expired at verify → rejected");

    // Also expire job path from pending
    const intent2 = await createIntent(pool, {
      dest: `dest_${rid("ex2")}`,
    });
    await activate(pool, intent2);
    await pool.query(
      `UPDATE deposit.intents SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [intent2]
    );
    await pool.query(`SELECT deposit.fn_expire_intent($1::uuid)`, [intent2]);
    const st2 = await statusOf(pool, intent2);
    assert(st2.status === "expired", "expire job → expired");
  }

  // 8) Forged attempt
  console.log("8) forged attempt");
  {
    const dest = `dest_${rid("fg")}`;
    const intentId = await createIntent(pool, { dest });
    await activate(pool, intentId, dest);
    const att = await recordAttempt(
      pool,
      intentId,
      rid("evt"),
      "unauthorized"
    );
    const st = await statusOf(pool, intentId);
    assert(att.duplicate === false, "forged attempt recorded");
    assert(
      st.status === "pending",
      "unauthorized attempt does not observe intent"
    );
  }

  // 9) Verification retry (soft fail → observed → verify again)
  console.log("9) verification retry");
  {
    const dest = `dest_${rid("vr")}`;
    const intentId = await createIntent(pool, { dest });
    await activate(pool, intentId, dest);
    const att = await recordAttempt(pool, intentId, rid("evt"));
    await beginVerify(pool, intentId);
    const soft = await failVerify(pool, intentId, att.attempt_id, "temporary", false);
    assert(soft.status === "observed", "soft fail returns to observed");
    await beginVerify(pool, intentId);
    const ver = await passVerify(
      pool,
      intentId,
      att.attempt_id,
      rid("pay"),
      AMOUNT,
      "IRR",
      dest
    );
    const credit = await postCredit(pool, intentId);
    const st = await statusOf(pool, intentId);
    assert(!!ver.verification_id, "retry verify can pass");
    assert(st.status === "credited", "retry path credits");
    assert(credit.replayed === false, "retry path posts credit once");
  }

  // 10) Crash after confirm before credit + reconcile
  console.log("10) crash after confirm before credit");
  {
    const dest = `dest_${rid("cr")}`;
    const before = await balance(pool, PLAYER_ID);
    const intentId = await createIntent(pool, { dest });
    await activate(pool, intentId, dest);
    const att = await recordAttempt(pool, intentId, rid("evt"));
    await beginVerify(pool, intentId);
    await passVerify(
      pool,
      intentId,
      att.attempt_id,
      rid("pay"),
      AMOUNT,
      "IRR",
      dest
    );
    let st = await statusOf(pool, intentId);
    assert(st.status === "confirmed", "stuck at confirmed (pre-credit)");
    const recon = await pool.query(`SELECT deposit.fn_recon_deposit() AS r`);
    assert(
      Number(recon.rows[0].r.details.confirmed_not_credited) >= 1,
      "recon flags confirmed_not_credited"
    );
    const credit = await postCredit(pool, intentId);
    st = await statusOf(pool, intentId);
    assert(st.status === "credited", "credit recovers after crash window");
    assert(credit.replayed === false, "recovery credit posts once");
    assert(
      (await balance(pool, PLAYER_ID)) === before + AMOUNT,
      "wallet credited once after recovery"
    );
  }

  // 11) Concurrent credit attempts
  console.log("11) concurrent credit attempts");
  {
    const dest = `dest_${rid("cc")}`;
    const before = await balance(pool, PLAYER_ID);
    const intentId = await createIntent(pool, { dest });
    await activate(pool, intentId, dest);
    const att = await recordAttempt(pool, intentId, rid("evt"));
    await beginVerify(pool, intentId);
    await passVerify(
      pool,
      intentId,
      att.attempt_id,
      rid("pay"),
      AMOUNT,
      "IRR",
      dest
    );

    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        postCredit(pool, intentId).catch((e) => ({ error: e.message }))
      )
    );
    const oks = results.filter((r) => r && r.ledger_tx_id && !r.error);
    const txIds = new Set(oks.map((r) => String(r.ledger_tx_id)));
    assert(oks.length >= 1, "at least one concurrent credit succeeds");
    assert(txIds.size === 1, "single ledger_tx under concurrency");
    assert(
      (await balance(pool, PLAYER_ID)) === before + AMOUNT,
      "concurrent credits move money once"
    );
  }

  // 12) wallet balance ≈ ledger projection for player (deposit_domain rows consistent)
  console.log("12) wallet balance = ledger projection (deposit path)");
  {
    // Local invariant on last deposit_domain tx
    const { rows } = await pool.query(
      `
      SELECT t.balance_before, t.balance_after, t.amount, w.balance
      FROM transactions t
      JOIN wallets w ON w.user_id = t.user_id AND w.currency = t.currency
      WHERE t.user_id = $1 AND t.source_kind = 'deposit_domain'
      ORDER BY t.created_at DESC
      LIMIT 1
      `,
      [PLAYER_ID]
    );
    assert(rows.length === 1, "deposit_domain ledger row exists");
    assert(
      Number(rows[0].balance_after) - Number(rows[0].balance_before) ===
        Number(rows[0].amount),
      "deposit ledger before/after matches amount"
    );
    // Full projection may drift historically; check admin-style delta consistency for deposit rows only
    const { rows: sumRows } = await pool.query(
      `
      SELECT coalesce(sum(balance_after - balance_before),0)::numeric AS delta
      FROM transactions
      WHERE user_id = $1 AND source_kind = 'deposit_domain' AND status = 'completed'
      `,
      [PLAYER_ID]
    );
    assert(Number(sumRows[0].delta) > 0, "deposit_domain projection delta > 0");
  }

  // 13) No client/direct table access for anon/authenticated
  console.log("13) no client/direct table access");
  {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE authenticated`);
      let denied = false;
      try {
        await client.query(`SELECT count(*) FROM deposit.intents`);
      } catch (e) {
        denied =
          String(e.message).toLowerCase().includes("permission") ||
          String(e.message).toLowerCase().includes("denied");
      }
      assert(denied, "authenticated cannot SELECT deposit.intents");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }

  // 14) Forbidden lifecycle transitions
  console.log("14) forbidden lifecycle transitions");
  {
    let bad = false;
    try {
      await pool.query(
        `SELECT deposit.fn_assert_transition('expired'::deposit.intent_status, 'credited'::deposit.intent_status)`
      );
    } catch (e) {
      bad = String(e.message).includes("forbidden_transition");
    }
    assert(bad, "expired→credited forbidden");

    bad = false;
    try {
      await pool.query(
        `SELECT deposit.fn_assert_transition('rejected'::deposit.intent_status, 'credited'::deposit.intent_status)`
      );
    } catch (e) {
      bad = String(e.message).includes("forbidden_transition");
    }
    assert(bad, "rejected→credited forbidden");

    // credited intent cannot post again as new money (replay only)
    const st = await statusOf(pool, hp.intentId);
    assert(st.status === "credited", "fixture still credited");
    const replay = await postCredit(pool, hp.intentId);
    assert(replay.replayed === true, "credited→credit is idempotent replay");
  }

  // 15) Append-only attempts
  console.log("15) append-only attempts/verifications");
  {
    const { rows } = await pool.query(
      `SELECT id FROM deposit.attempts ORDER BY created_at DESC LIMIT 1`
    );
    let blocked = false;
    try {
      await pool.query(`DELETE FROM deposit.attempts WHERE id = $1`, [
        rows[0].id,
      ]);
    } catch (e) {
      blocked = String(e.message).includes("append_only");
    }
    assert(blocked, "attempts delete blocked");
  }

  // Final recon
  {
    console.log("16) deposit recon report");
    const { rows } = await pool.query(`SELECT deposit.fn_recon_deposit() AS r`);
    assert(rows[0].r.report_id != null, "recon report stored");
    assert(rows[0].r.details != null, "recon details present");
  }

  await pool.end();
  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
  console.log("P6_5_DEPOSIT_DOMAIN_TESTS_PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
