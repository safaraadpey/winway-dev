"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/contexts/SessionContext";
import { isHardExiting } from "@/lib/auth/hardExit";

const REDIRECT_GRACE_MS = 1500;

type ClientAuthGuardProps = {
  children: React.ReactNode;
  /** When false, shell renders immediately; redirect runs in background. Default true. */
  blockShell?: boolean;
  /** Login route after grace period when user identity is missing. Default /login. */
  loginPath?: string;
};

export default function ClientAuthGuard({
  children,
  blockShell = true,
  loginPath = "/login",
}: ClientAuthGuardProps) {
  const router = useRouter();
  const { authReady, userId } = useSession();
  const redirectingRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!authReady) return;
    if (isHardExiting()) return;

    if (userId) {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
      redirectingRef.current = false;
      return;
    }

    // Redirect only when the user identity is truly missing.
    // We intentionally do NOT redirect on transient token gaps to avoid
    // sending users back to login during brief auth refresh windows.
    if (redirectingRef.current || redirectTimerRef.current) return;

    redirectTimerRef.current = setTimeout(() => {
      redirectTimerRef.current = null;
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      console.log("[Auth] ClientAuthGuard redirect", { loginPath });
      router.replace(loginPath);
    }, REDIRECT_GRACE_MS);
  }, [authReady, userId, loginPath, router]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, []);

  if (isHardExiting()) return null;

  if (!blockShell) {
    return <>{children}</>;
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-300 border-r-transparent" />
      </div>
    );
  }

  // Preserve UX stability: keep the user in-app when identity exists,
  // even if accessToken is briefly unavailable.
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-300 border-r-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
