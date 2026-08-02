/**
 * One-off: seed players/agents/supers from tmp/winway_old-users-balances.temp.md
 * Parent adminzero must already exist. Password for all new/updated users: 123456
 */
require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

const PASSWORD = "123456";
const ADMINZERO_REF = "ADMIN26";
const MAJID_REF = "MAJID";
const RAMRAM_REF = "RAM1414";

/** @type {{ username: string; role: 'super'|'agent'|'player'; parent: 'adminzero'|'majid'|'ramram1414'; balance: number; locked: number; nickname?: string }[]} */
const USERS = [
  { username: "majid", role: "super", parent: "adminzero", balance: 15552, locked: 0 },
  { username: "ramram1414", role: "agent", parent: "adminzero", balance: 89, locked: 0 },
  { username: "babak", role: "player", parent: "adminzero", balance: 500000, locked: 0 },
  { username: "deep", role: "player", parent: "adminzero", balance: 500000, locked: 0 },
  { username: "demo", role: "player", parent: "adminzero", balance: 315500, locked: 25000 },
  { username: "demoplayer002", role: "player", parent: "adminzero", balance: 0, locked: 0 },
  { username: "fardigsm556", role: "player", parent: "adminzero", balance: 0, locked: 0 },
  { username: "player003", role: "player", parent: "adminzero", balance: 0, locked: 0 },
  { username: "saleh13", role: "player", parent: "adminzero", balance: 0, locked: 0 },
  { username: "salvador", role: "player", parent: "adminzero", balance: 669900, locked: 25000 },
  { username: "sorena13", role: "player", parent: "adminzero", balance: 0, locked: 0 },
  { username: "abol5073", role: "player", parent: "majid", balance: 100000, locked: 0 },
  { username: "amirsha", role: "player", parent: "majid", balance: 126013, locked: 0 },
  { username: "hamburg", role: "player", parent: "majid", balance: 207863, locked: 0, nickname: "Cartel" },
  { username: "los_angeles", role: "player", parent: "majid", balance: 651488, locked: 0 },
  { username: "makhmal", role: "player", parent: "majid", balance: 818489, locked: 0 },
  { username: "mho2305", role: "player", parent: "majid", balance: 307676, locked: 0 },
  { username: "par_par", role: "player", parent: "majid", balance: 553025, locked: 0 },
  { username: "paris", role: "player", parent: "majid", balance: 245151, locked: 0 },
  { username: "tokyo", role: "player", parent: "majid", balance: 3741000, locked: 0 },
  { username: "toronto", role: "player", parent: "majid", balance: 210838, locked: 0 },
  { username: "141", role: "player", parent: "ramram1414", balance: 500000, locked: 0 },
  { username: "ahmad", role: "player", parent: "ramram1414", balance: 500000, locked: 0 },
  { username: "alim9756", role: "player", parent: "ramram1414", balance: 490000, locked: 0 },
  { username: "hatef69", role: "player", parent: "ramram1414", balance: 500000, locked: 0 },
  { username: "mahin1363", role: "player", parent: "ramram1414", balance: 3488563, locked: 0 },
  { username: "mahla_md", role: "player", parent: "ramram1414", balance: 0, locked: 0 },
  { username: "mahla1380", role: "player", parent: "ramram1414", balance: 500000, locked: 0 },
  { username: "mohammad", role: "player", parent: "ramram1414", balance: 500000, locked: 0 },
  { username: "ramin5772", role: "player", parent: "ramram1414", balance: 0, locked: 0 },
  { username: "ramtin1366", role: "player", parent: "ramram1414", balance: 500000, locked: 0 },
];

function emailFor(username) {
  return `${username}@dingmoney.org`;
}

function referralForParent(parent) {
  if (parent === "adminzero") return ADMINZERO_REF;
  if (parent === "majid") return MAJID_REF;
  if (parent === "ramram1414") return RAMRAM_REF;
  throw new Error(`unknown parent ${parent}`);
}

function ownReferralCode(entry) {
  if (entry.role === "super" && entry.username === "majid") return MAJID_REF;
  if (entry.role === "agent" && entry.username === "ramram1414") return RAMRAM_REF;
  return null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[Seed] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (...args) => fetch(...args),
    },
    realtime: {
      // Node 20 script: avoid native WebSocket requirement
      transport: class {
        constructor() {}
        close() {}
        send() {}
        addEventListener() {}
        removeEventListener() {}
      },
    },
  });

  const { data: adminzero, error: azErr } = await supabase
    .from("users")
    .select("id, username, referral_code")
    .eq("username", "adminzero")
    .eq("role", "admin")
    .single();

  if (azErr || !adminzero) {
    console.error("[Seed] adminzero not found:", azErr?.message);
    process.exit(1);
  }

  console.log(`[Seed] Using adminzero id=${adminzero.id} referral=${adminzero.referral_code}`);

  const results = [];

  for (const entry of USERS) {
    const email = emailFor(entry.username);
    const signupReferral = referralForParent(entry.parent);

    let userId = null;

    const { data: existing } = await supabase
      .from("users")
      .select("id, role")
      .eq("username", entry.username)
      .maybeSingle();

    if (existing?.id) {
      userId = existing.id;
      console.log(`[Seed] ${entry.username}: exists ${userId}`);
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { referral_code: signupReferral },
      });

      if (createErr || !created?.user?.id) {
        console.error(`[Seed] ${entry.username}: create failed`, createErr?.message);
        results.push({ username: entry.username, ok: false, error: createErr?.message });
        continue;
      }

      userId = created.user.id;
      console.log(`[Seed] ${entry.username}: created auth ${userId}`);
    }

    const ownRef = ownReferralCode(entry);
    const userPatch = {
      role: entry.role,
      status: "active",
      parent_id: entry.parent === "adminzero" ? adminzero.id : undefined,
    };

    if (entry.role !== "player" || ownRef) {
      if (entry.parent === "adminzero") userPatch.parent_id = adminzero.id;
    }

    if (ownRef) userPatch.referral_code = ownRef;

    const { error: userUpdErr } = await supabase.from("users").update(userPatch).eq("id", userId);
    if (userUpdErr) {
      console.error(`[Seed] ${entry.username}: users update`, userUpdErr.message);
      results.push({ username: entry.username, ok: false, error: userUpdErr.message });
      continue;
    }

    if (entry.parent === "majid") {
      const { data: majidRow } = await supabase
        .from("users")
        .select("id")
        .eq("username", "majid")
        .single();
      if (majidRow?.id) {
        await supabase.from("users").update({ parent_id: majidRow.id }).eq("id", userId);
      }
    } else if (entry.parent === "ramram1414") {
      const { data: agentRow } = await supabase
        .from("users")
        .select("id")
        .eq("username", "ramram1414")
        .single();
      if (agentRow?.id) {
        await supabase.from("users").update({ parent_id: agentRow.id }).eq("id", userId);
      }
    }

    const { error: walletErr } = await supabase
      .from("wallets")
      .upsert(
        {
          user_id: userId,
          balance: entry.balance,
          locked_amount: entry.locked,
          currency: "IRR",
        },
        { onConflict: "user_id" }
      );

    if (walletErr) {
      const { error: walletUpdErr } = await supabase
        .from("wallets")
        .update({ balance: entry.balance, locked_amount: entry.locked, currency: "IRR" })
        .eq("user_id", userId);
      if (walletUpdErr) {
        console.error(`[Seed] ${entry.username}: wallet`, walletErr.message, walletUpdErr.message);
      }
    }

    if (entry.nickname) {
      await supabase
        .from("user_profiles")
        .upsert({ user_id: userId, nickname: entry.nickname, language: "fa" }, { onConflict: "user_id" });
    }

    const { error: pwdErr } = await supabase.auth.admin.updateUserById(userId, {
      password: PASSWORD,
    });
    if (pwdErr) {
      console.error(`[Seed] ${entry.username}: password`, pwdErr.message);
    }

    results.push({ username: entry.username, ok: true, id: userId, role: entry.role });
  }

  console.log("\n[Seed] Done:", results.filter((r) => r.ok).length, "ok,", results.filter((r) => !r.ok).length, "failed");
  for (const r of results.filter((x) => !x.ok)) {
    console.log("  FAIL", r.username, r.error);
  }
}

main().catch((e) => {
  console.error("[Seed] fatal", e);
  process.exit(1);
});
