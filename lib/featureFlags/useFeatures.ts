"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { HARD_EXIT_EVENT } from "@/lib/auth/hardExit";

type FeatureSnapshot = {
  features: string[];
  evaluatedAt: string;
};

let cachedSnapshot: FeatureSnapshot | null = null;
let inflightPromise: Promise<FeatureSnapshot> | null = null;

function clearFeatureClientCache() {
  cachedSnapshot = null;
  inflightPromise = null;
}

async function loadFeaturesFromApi(): Promise<FeatureSnapshot> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    return { features: [], evaluatedAt: new Date().toISOString() };
  }

  const response = await fetch("/api/player/features", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Failed to load features");
  }

  return payload.data as FeatureSnapshot;
}

export function useFeatures() {
  const [features, setFeatures] = useState<string[]>(cachedSnapshot?.features ?? []);
  const [loading, setLoading] = useState(!cachedSnapshot);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    try {
      setLoading(true);
      setError(null);

      if (!force && cachedSnapshot) {
        setFeatures(cachedSnapshot.features);
        setLoading(false);
        return cachedSnapshot.features;
      }

      if (!inflightPromise) {
        inflightPromise = loadFeaturesFromApi()
          .then((snapshot) => {
            cachedSnapshot = snapshot;
            return snapshot;
          })
          .finally(() => {
            inflightPromise = null;
          });
      }

      const snapshot = await inflightPromise;
      setFeatures(snapshot.features);
      return snapshot.features;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load features";
      setError(message);
      setFeatures([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useEffect(() => {
    const onHardExit = () => {
      clearFeatureClientCache();
      setFeatures([]);
    };

    window.addEventListener(HARD_EXIT_EVENT, onHardExit);
    return () => {
      window.removeEventListener(HARD_EXIT_EVENT, onHardExit);
    };
  }, []);

  const hasFeature = useCallback(
    (featureKey: string) => features.includes(featureKey),
    [features]
  );

  return {
    features,
    loading,
    error,
    hasFeature,
    refresh,
  };
}

export function invalidateClientFeatureCache() {
  clearFeatureClientCache();
}
