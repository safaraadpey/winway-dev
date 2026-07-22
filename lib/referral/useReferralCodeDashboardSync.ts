"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { clearDashboardCache, loadDashboardUserInfo } from "@/services/dashboard";
import type { DashboardData } from "@/src/types/dashboard";
import { REFERRAL_CODE_UPDATED_EVENT, type ReferralCodeUpdatedDetail } from "@/lib/referral/referralCodeEvents";

export function useReferralCodeDashboardSync(
  setData: Dispatch<SetStateAction<DashboardData | null>>
) {
  useEffect(() => {
    function handleReferralCodeUpdated(event: Event) {
      const detail = (event as CustomEvent<ReferralCodeUpdatedDetail>).detail;
      if (!detail?.referralCode) return;

      clearDashboardCache();

      setData((prev) => {
        if (!prev?.user) return prev;
        return {
          ...prev,
          user: {
            ...prev.user,
            referralCode: detail.referralCode,
          },
        };
      });

      void loadDashboardUserInfo()
        .then((user) => {
          if (!user) return;
          setData((prev) => (prev ? { ...prev, user } : prev));
        })
        .catch((error) => {
          console.error("[ReferralCodeDashboardSync] Failed to refresh user info:", error);
        });
    }

    window.addEventListener(REFERRAL_CODE_UPDATED_EVENT, handleReferralCodeUpdated);
    return () => {
      window.removeEventListener(REFERRAL_CODE_UPDATED_EVENT, handleReferralCodeUpdated);
    };
  }, [setData]);
}
