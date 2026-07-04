"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { canAccessAdminPanel, getCurrentUserRoleInfo } from "@/lib/auth-helpers";
import { isHardExiting } from "@/lib/auth/hardExit";

/**
 * Defense-in-depth guard for admin panel routes.
 * Server gate runs first; this verifies in the background without blocking shell render.
 */
export default function AdminPanelAuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const redirectingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function verifyAccess() {
      try {
        if (isHardExiting()) return;

        const roleInfo = await getCurrentUserRoleInfo();

        if (cancelled || redirectingRef.current || isHardExiting()) return;

        if (!roleInfo) {
          redirectingRef.current = true;
          router.replace("/login");
          return;
        }

        if (canAccessAdminPanel(roleInfo.role, roleInfo.admin_sub_role)) {
          return;
        }

        if (roleInfo.role === "admin") {
          redirectingRef.current = true;
          router.replace("/dev-panel/dashboard");
          return;
        }

        redirectingRef.current = true;
        router.replace("/login");
      } catch (error) {
        console.error("AdminPanelAuthGuard error:", error);
        if (!cancelled && !redirectingRef.current) {
          redirectingRef.current = true;
          router.replace("/login");
        }
      }
    }

    verifyAccess();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (isHardExiting()) return null;

  return <>{children}</>;
}
