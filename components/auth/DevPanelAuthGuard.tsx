"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { canAccessDevPanel, getCurrentUserRoleInfo } from "@/lib/auth-helpers";

export default function DevPanelAuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const redirectingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function verifyAccess() {
      try {
        const roleInfo = await getCurrentUserRoleInfo();

        if (cancelled || redirectingRef.current) return;

        if (!roleInfo) {
          redirectingRef.current = true;
          router.replace("/login");
          return;
        }

        if (canAccessDevPanel(roleInfo.role, roleInfo.admin_sub_role)) {
          setAllowed(true);
          setChecking(false);
          return;
        }

        redirectingRef.current = true;
        if (roleInfo.role === "admin") {
          router.replace("/admin/dashboard");
          return;
        }

        router.replace("/login");
      } catch (error) {
        console.error("DevPanelAuthGuard error:", error);
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

  if (checking || !allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E0E0F]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-300 border-r-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
