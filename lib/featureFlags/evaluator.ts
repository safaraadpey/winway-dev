import { pgPool } from "@/lib/pg";
import { supabaseServer } from "@/lib/supabaseServer";

const CACHE_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 512;

type CacheEntry = {
  features: string[];
  expiresAtMs: number;
};

const userFeaturesCache = new Map<string, CacheEntry>();

function pruneCacheIfNeeded() {
  if (userFeaturesCache.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = userFeaturesCache.keys().next().value;
  if (oldestKey) {
    userFeaturesCache.delete(oldestKey);
  }
}

export function invalidateUserFeatures(userId: string | null | undefined) {
  if (!userId) {
    return;
  }
  userFeaturesCache.delete(userId);
  console.log("[Feature] cache invalidated", { userId });
}

export function clearFeatureCache() {
  userFeaturesCache.clear();
  console.log("[Feature] cache cleared");
}

async function loadUserFeaturesFromPg(userId: string): Promise<string[] | null> {
  if (!pgPool) {
    return null;
  }

  const { rows } = await pgPool.query<{ key: string }>(
    "SELECT public.fn_user_features($1::uuid) AS key",
    [userId]
  );

  return rows.map((row) => row.key);
}

async function loadUserFeaturesFromSupabase(userId: string): Promise<string[]> {
  const { data, error } = await supabaseServer.rpc("fn_user_features", {
    p_user_id: userId,
  });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.filter((key): key is string => typeof key === "string") : [];
}

async function loadHasFeatureFromPg(userId: string, key: string): Promise<boolean | null> {
  if (!pgPool) {
    return null;
  }

  const { rows } = await pgPool.query<{ enabled: boolean }>(
    "SELECT public.fn_has_feature($1::uuid, $2::text) AS enabled",
    [userId, key]
  );

  return Boolean(rows[0]?.enabled);
}

async function loadHasFeatureFromSupabase(userId: string, key: string): Promise<boolean> {
  const { data, error } = await supabaseServer.rpc("fn_has_feature", {
    p_user_id: userId,
    p_key: key,
  });

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function getUserFeatures(
  userId: string,
  opts?: { fresh?: boolean }
): Promise<string[]> {
  if (!userId) {
    return [];
  }

  if (!opts?.fresh) {
    const cached = userFeaturesCache.get(userId);
    if (cached && cached.expiresAtMs > Date.now()) {
      return cached.features;
    }
  }

  let features: string[] = [];
  let source: "pg" | "supabase" = "pg";

  try {
    const pgFeatures = await loadUserFeaturesFromPg(userId);
    if (pgFeatures !== null) {
      features = pgFeatures;
      source = "pg";
    } else {
      features = await loadUserFeaturesFromSupabase(userId);
      source = "supabase";
    }
  } catch (err) {
    console.error("[Feature] evaluate failed", { userId, err });
    return [];
  }

  userFeaturesCache.set(userId, {
    features,
    expiresAtMs: Date.now() + CACHE_TTL_MS,
  });
  pruneCacheIfNeeded();

  console.log("[Feature] evaluate", {
    userId,
    source,
    count: features.length,
  });

  return features;
}

export async function hasFeature(userId: string, key: string): Promise<boolean> {
  if (!userId || !key) {
    return false;
  }

  let enabled = false;
  let source: "pg" | "supabase" = "pg";

  try {
    const pgResult = await loadHasFeatureFromPg(userId, key);
    if (pgResult !== null) {
      enabled = pgResult;
      source = "pg";
    } else {
      enabled = await loadHasFeatureFromSupabase(userId, key);
      source = "supabase";
    }
  } catch (err) {
    console.error("[Feature] hasFeature pg evaluate failed, trying supabase fallback", {
      userId,
      key,
      err,
    });
    try {
      enabled = await loadHasFeatureFromSupabase(userId, key);
      source = "supabase";
    } catch (fallbackErr) {
      console.error("[Feature] hasFeature evaluate failed", { userId, key, err: fallbackErr });
      return false;
    }
  }

  console.log("[Feature] hasFeature evaluate", {
    userId,
    key,
    source,
    enabled,
  });

  return enabled;
}
