"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/contexts/SessionContext";
import { loadDashboardUserInfo } from "@/services/dashboard";

const HIDDEN_PATH_PREFIXES = ["/agent/login", "/agent/settings"];

function isHiddenPath(pathname: string): boolean {
  return HIDDEN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function ReferralCodeRequiredModal() {
  const pathname = usePathname();
  const router = useRouter();
  const { userId, authReady } = useSession();
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!authReady || !userId || isHiddenPath(pathname)) {
      setShow(false);
      setChecking(false);
      return;
    }

    let cancelled = false;

    async function checkReferralCode() {
      setChecking(true);
      try {
        const user = await loadDashboardUserInfo();
        if (cancelled) return;

        const needsReferralCode =
          !!user &&
          (user.role === "agent" || user.role === "super") &&
          !user.referralCode?.trim();

        setShow(needsReferralCode);
      } catch (error) {
        console.error("[ReferralCodeRequiredModal] Failed to check referral code", error);
        if (!cancelled) setShow(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void checkReferralCode();

    return () => {
      cancelled = true;
    };
  }, [authReady, userId, pathname]);

  if (checking || !show) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#0b1120] rounded-2xl p-6 w-full max-w-md border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-3">تنظیم کد معرف</h2>
        <p className="text-gray-300 text-sm leading-7 mb-6">
          قبل از شروع کار در پنل، لطفاً کد معرف خود را تنظیم کنید.
        </p>
        <button
          type="button"
          onClick={() => router.push("/agent/settings")}
          className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
        >
          تنظیم کد معرف
        </button>
      </div>
    </div>
  );
}
