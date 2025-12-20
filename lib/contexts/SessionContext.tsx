"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

type SessionSnapshot = {
  userId: string | null;
  accessToken: string | null;
  authReady: boolean;
  tokenVersion: number;
};

const SessionContext = createContext<SessionSnapshot | null>(null);

function devLog(event: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[Session][Metrics]", event, payload);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const tokenVersionRef = useRef(0);
  const [snap, setSnap] = useState<SessionSnapshot>({
    userId: null,
    accessToken: null,
    authReady: false,
    tokenVersion: 0,
  });

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        const session = data?.session ?? null;
        tokenVersionRef.current += 1;
        const next: SessionSnapshot = {
          userId: session?.user?.id ?? null,
          accessToken: session?.access_token ?? null,
          authReady: true,
          tokenVersion: tokenVersionRef.current,
        };
        setSnap(next);
        devLog("hydrate", { userId: next.userId, hasToken: Boolean(next.accessToken), tokenVersion: next.tokenVersion });
      } catch (err: any) {
        if (!mounted) return;
        tokenVersionRef.current += 1;
        const next: SessionSnapshot = {
          userId: null,
          accessToken: null,
          authReady: true,
          tokenVersion: tokenVersionRef.current,
        };
        setSnap(next);
        devLog("hydrate:error", { error: String(err?.message ?? err), tokenVersion: next.tokenVersion });
      }
    }

    hydrate();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      tokenVersionRef.current += 1;
      const next: SessionSnapshot = {
        userId: session?.user?.id ?? null,
        accessToken: session?.access_token ?? null,
        authReady: true,
        tokenVersion: tokenVersionRef.current,
      };
      setSnap(next);
      devLog("auth-change", {
        event,
        userId: next.userId,
        hasToken: Boolean(next.accessToken),
        tokenVersion: next.tokenVersion,
      });
    });

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(() => snap, [snap]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionSnapshot {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}


