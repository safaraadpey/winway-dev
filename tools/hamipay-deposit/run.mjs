/**
 * HamiPay deposit safety tests (DB + deposit RPCs, mock provider assumptions).
 * Usage: npm run test:hamipay-deposit
 *
 * Covers:
 * - one-time wallet credit via fn_post_credit
 * - duplicate credit replay
 * - amount mismatch reject (no credit)
 * - provider unit conversion helpers
 */
import crypto from "crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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

function tomanToProviderAmount(toman, unit = "rial") {
  return unit === "rial" ? toman * 10 : toman;
}

function providerAmountToToman(providerAmount, unit = "rial") {
  return unit === "rial"
    ? Math.floor(providerAmount / 10)
    : Math.floor(providerAmount);
}

async function pickPlayer() {
  const { rows } = await pool.query(
    `SELECT id FROM public.users WHERE role = 'player' AND status = 'active' LIMIT 1`
  );
  if (!rows[0]) throw new Error("no player");
  return rows[0].id;
}

async function balance(userId) {
  const { rows } = await pool.query(
    `SELECT balance::numeric AS b FROM public.wallets WHERE user_id = $1 AND currency = 'IRR'`,
    [userId]
  );
  return Number(rows[0]?.b ?? 0);
}

async function createHamiIntent(userId, amountToman) {
  const expires = new Date(Date.now() + 3600_000);
  const { rows } = await pool.query(
    `SELECT deposit.fn_create_intent(
       $1::uuid, 'fiat_gateway', 'hamipay', $2::numeric, 'IRR', $3::timestamptz,
       NULL, $4::jsonb, 'test', $1::uuid, NULL
     ) AS id`,
    [
      userId,
      amountToman,
      expires.toISOString(),
      JSON.stringify({ environment: "development", source: "test" }),
    ]
  );
  const id = rows[0].id;
  const payId = `test_pay_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await pool.query(
    `UPDATE deposit.intents
     SET environment = 'development',
         merchant_order_id = $2,
         provider_intent_ref = $3,
         payment_url = $4
     WHERE id = $1`,
    [id, id, payId, `https://example.test/pay/${id}`]
  );
  await pool.query(`SELECT deposit.fn_activate_intent($1::uuid, $2)`, [
    id,
    payId,
  ]);
  return { id, payId };
}

async function passAndCredit(intentId, payId, amountToman) {
  const eventId = `evt_${crypto.randomUUID()}`;
  const hash = crypto.createHash("sha256").update(eventId).digest("hex");
  const attempt = await pool.query(
    `SELECT deposit.fn_record_attempt(
       $1::uuid, 'hamipay', $2, $3, 'accepted'::deposit.attempt_parse_status,
       $4, '{}'::jsonb
     ) AS result`,
    [intentId, eventId, hash, `inline:${hash.slice(0, 8)}`]
  );
  const attemptId = attempt.rows[0].result.attempt_id;
  await pool.query(`SELECT deposit.fn_begin_verification($1::uuid)`, [
    intentId,
  ]);
  const pass = await pool.query(
    `SELECT deposit.fn_pass_verification(
       $1::uuid, $2::uuid, 'hamipay', $3, $4::numeric, 'IRR', '{}'::jsonb, NULL, NULL
     ) AS result`,
    [intentId, attemptId, payId, amountToman]
  );
  if (pass.rows[0].result.result === "fail") {
    return { pass: pass.rows[0].result, credit: null };
  }
  const credit = await pool.query(
    `SELECT deposit.fn_post_credit($1::uuid) AS result`,
    [intentId]
  );
  return { pass: pass.rows[0].result, credit: credit.rows[0].result };
}

async function run() {
  console.log("[test:hamipay-deposit] start");

  // unit helpers (default rial = Shaparak/SEP)
  assert(
    tomanToProviderAmount(10000) === 100000,
    "default toman→provider (rial)"
  );
  assert(
    tomanToProviderAmount(10000, "toman") === 10000,
    "legacy toman identity"
  );
  assert(
    tomanToProviderAmount(10000, "rial") === 100000,
    "toman→rial conversion"
  );
  assert(
    providerAmountToToman(100000) === 10000,
    "default rial→toman conversion"
  );
  assert(
    providerAmountToToman(100000, "rial") === 10000,
    "rial→toman conversion"
  );

  const userId = await pickPlayer();
  const amount = 15_000 + Math.floor(Math.random() * 1000);

  // happy path + replay
  const before = await balance(userId);
  const { id, payId } = await createHamiIntent(userId, amount);
  const first = await passAndCredit(id, payId, amount);
  assert(first.pass.result === "pass", "verification pass");
  assert(first.credit?.status === "posted", "credit posted");
  const mid = await balance(userId);
  assert(mid === before + amount, "wallet +amount once", `before=${before} mid=${mid}`);

  const second = await pool.query(
    `SELECT deposit.fn_post_credit($1::uuid) AS result`,
    [id]
  );
  assert(second.rows[0].result.replayed === true, "credit replayed flag");
  const after = await balance(userId);
  assert(after === mid, "no double credit");

  // amount mismatch
  const { id: id2, payId: pay2 } = await createHamiIntent(userId, amount + 5);
  const beforeMismatch = await balance(userId);
  const eventId = `evt_${crypto.randomUUID()}`;
  const hash = crypto.createHash("sha256").update(eventId).digest("hex");
  const attempt = await pool.query(
    `SELECT deposit.fn_record_attempt(
       $1::uuid, 'hamipay', $2, $3, 'accepted'::deposit.attempt_parse_status,
       $4, '{}'::jsonb
     ) AS result`,
    [id2, eventId, hash, `inline:${hash.slice(0, 8)}`]
  );
  await pool.query(`SELECT deposit.fn_begin_verification($1::uuid)`, [id2]);
  const mismatch = await pool.query(
    `SELECT deposit.fn_pass_verification(
       $1::uuid, $2::uuid, 'hamipay', $3, $4::numeric, 'IRR', '{}'::jsonb, NULL, NULL
     ) AS result`,
    [id2, attempt.rows[0].result.attempt_id, pay2, amount + 999]
  );
  assert(mismatch.rows[0].result.result === "fail", "amount mismatch fail");
  assert(
    (await balance(userId)) === beforeMismatch,
    "mismatch does not credit wallet"
  );

  // created → failed transition (failed_to_create)
  const expires = new Date(Date.now() + 3600_000);
  const createdOnly = await pool.query(
    `SELECT deposit.fn_create_intent(
       $1::uuid, 'fiat_gateway', 'hamipay', $2::numeric, 'IRR', $3::timestamptz,
       NULL, '{}'::jsonb, 'test', NULL, NULL
     ) AS id`,
    [userId, amount + 9, expires.toISOString()]
  );
  await pool.query(`SELECT deposit.fn_mark_create_failed($1::uuid, $2)`, [
    createdOnly.rows[0].id,
    "failed_to_create",
  ]);
  const st = await pool.query(
    `SELECT status FROM deposit.intents WHERE id = $1`,
    [createdOnly.rows[0].id]
  );
  assert(st.rows[0].status === "failed", "mark create failed");

  console.log(
    `\n[test:hamipay-deposit] done — passed=${passed} failed=${failed}`
  );
  if (failed > 0) process.exitCode = 1;
}

run()
  .catch((err) => {
    console.error("[test:hamipay-deposit] FATAL", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
