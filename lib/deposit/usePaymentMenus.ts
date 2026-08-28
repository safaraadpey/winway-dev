"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { HARD_EXIT_EVENT } from "@/lib/auth/hardExit";

export type PlayerPaymentMenus = {
  walletBuy: boolean;
  buyRial: boolean;
};

const DEFAULT_MENUS: PlayerPaymentMenus = {
  walletBuy: true,
  buyRial: true,
};

let cachedMenus: PlayerPaymentMenus | null = null;
let inflightPromise: Promise<PlayerPaymentMenus> | null = null;

function clearCache() {
  cachedMenus = null;
  inflightPromise = null;
}

async function loadMenusFromApi(): Promise<PlayerPaymentMenus> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    return { walletBuy: false, buyRial: false };
  }

  const response = await fetch("/api/player/deposit/menus", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || "Failed to load payment menus");
  }

  return {
    walletBuy: payload?.data?.walletBuy !== false,
    buyRial: payload?.data?.buyRial !== false,
  };
}

export function usePaymentMenus() {
  const [menus, setMenus] = useState<PlayerPaymentMenus>(
    cachedMenus ?? DEFAULT_MENUS
  );
  const [loading, setLoading] = useState(!cachedMenus);

  const refresh = useCallback(async (force = false) => {
    try {
      setLoading(true);
      if (!force && cachedMenus) {
        setMenus(cachedMenus);
        setLoading(false);
        return cachedMenus;
      }

      if (!inflightPromise) {
        inflightPromise = loadMenusFromApi()
          .then((snapshot) => {
            cachedMenus = snapshot;
            return snapshot;
          })
          .finally(() => {
            inflightPromise = null;
          });
      }

      const snapshot = await inflightPromise;
      setMenus(snapshot);
      return snapshot;
    } catch (err) {
      console.error("[Payment] player menus load failed", err);
      setMenus(DEFAULT_MENUS);
      return DEFAULT_MENUS;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useEffect(() => {
    const onHardExit = () => {
      clearCache();
      setMenus({ walletBuy: false, buyRial: false });
    };
    window.addEventListener(HARD_EXIT_EVENT, onHardExit);
    return () => window.removeEventListener(HARD_EXIT_EVENT, onHardExit);
  }, []);

  return { menus, loading, refresh };
}
