"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useIsAdminZero(): { ready: boolean; isAdminZero: boolean } {
  const [ready, setReady] = useState(false);
  const [isAdminZero, setIsAdminZero] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [{ data: sessionData }, { data: adminZero }] = await Promise.all([
          supabase.auth.getSession(),
          supabase
            .from("users")
            .select("id")
            .eq("username", "adminzero")
            .eq("role", "admin")
            .maybeSingle(),
        ]);

        if (cancelled) return;
        const userId = sessionData.session?.user?.id ?? null;
        setIsAdminZero(Boolean(userId && adminZero?.id && userId === adminZero.id));
      } catch {
        if (!cancelled) setIsAdminZero(false);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, isAdminZero };
}
