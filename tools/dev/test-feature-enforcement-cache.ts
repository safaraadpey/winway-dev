import { config } from "dotenv";

config({ path: ".env.local" });

const userId = "9bca7301-9a22-4b8c-b032-1122e86350da";
const key = "sample_beta_badge";

const userFeaturesCache = new Map<string, { features: string[]; expiresAtMs: number }>();

async function getUserFeaturesCached(pool: import("pg").Pool, userId: string): Promise<string[]> {
  const cached = userFeaturesCache.get(userId);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.features;
  }

  const { rows } = await pool.query<{ key: string }>(
    "SELECT public.fn_user_features($1::uuid) AS key",
    [userId]
  );
  const features = rows.map((row) => row.key);
  userFeaturesCache.set(userId, {
    features,
    expiresAtMs: Date.now() + 5_000,
  });
  return features;
}

async function hasFeatureDirect(pool: import("pg").Pool, userId: string, featureKey: string) {
  const { rows } = await pool.query<{ enabled: boolean }>(
    "SELECT public.fn_has_feature($1::uuid, $2::text) AS enabled",
    [userId, featureKey]
  );
  return Boolean(rows[0]?.enabled);
}

async function run() {
  const { pgPool } = await import("../../lib/pg");
  if (!pgPool) {
    throw new Error("pgPool unavailable");
  }

  await pgPool.query(
    "UPDATE public.features SET is_enabled = true, default_enabled = false WHERE key = $1",
    [key]
  );
  await pgPool.query(
    `INSERT INTO public.feature_user_overrides(feature_id, user_id, is_enabled)
     SELECT id, $2::uuid, true FROM public.features WHERE key = $1
     ON CONFLICT (feature_id, user_id) DO UPDATE SET is_enabled = true`,
    [key, userId]
  );

  const snapshotBefore = await getUserFeaturesCached(pgPool, userId);
  const enforcedBefore = await hasFeatureDirect(pgPool, userId, key);

  await pgPool.query("UPDATE public.features SET is_enabled = false WHERE key = $1", [key]);

  const snapshotAfterDisable = await getUserFeaturesCached(pgPool, userId);
  const enforcedAfterDisable = await hasFeatureDirect(pgPool, userId, key);

  await pgPool.query(
    `DELETE FROM public.feature_user_overrides
     WHERE user_id = $1::uuid
       AND feature_id = (SELECT id FROM public.features WHERE key = $2)`,
    [userId, key]
  );
  await pgPool.query(
    "UPDATE public.features SET is_enabled = false, default_enabled = false WHERE key = $1",
    [key]
  );

  console.log("before_disable", {
    snapshotIncludes: snapshotBefore.includes(key),
    enforced: enforcedBefore,
  });
  console.log("after_disable", {
    snapshotIncludes: snapshotAfterDisable.includes(key),
    enforced: enforcedAfterDisable,
  });

  if (!enforcedBefore) {
    throw new Error("expected enforced true before disable");
  }
  if (enforcedAfterDisable) {
    throw new Error("expected enforced false immediately after disable");
  }
  if (!snapshotAfterDisable.includes(key)) {
    throw new Error("expected cached getUserFeatures snapshot to remain stale until TTL");
  }

  console.log("PASS: backend enforcement bypasses cached snapshot immediately after kill switch");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
