"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  buildRegistrationLink,
} from "@/lib/referral/buildRegistrationLink";

type ReferralRegistrationLinkProps = {
  referralCode: string | null | undefined;
  settingsPath: string;
  hasReferralCode: boolean;
};

export default function ReferralRegistrationLink({
  referralCode,
  settingsPath,
  hasReferralCode,
}: ReferralRegistrationLinkProps) {
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const normalizedCode = referralCode?.trim().toUpperCase() ?? "";
  const fullLink = normalizedCode ? buildRegistrationLink(normalizedCode) : "";

  const handleCopy = async () => {
    if (copying || !fullLink) return;

    setCopying(true);
    try {
      await navigator.clipboard.writeText(fullLink);
      toast.success("لینک ثبت‌نام کپی شد");
    } catch {
      toast.error("خطا در کپی لینک");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-700 bg-[#151515] p-3 mb-3">
      <div className="text-gray-400 text-xs mb-2">لینک ثبت‌نام</div>
      <div className="flex items-center gap-2">
        <div
          className="flex-1 min-w-0 h-10 rounded-lg bg-[#1f1f1f] border border-gray-700 flex items-center px-3 text-sm font-mono truncate dir-ltr text-left"
          title={fullLink || undefined}
        >
          {normalizedCode ? (
            <>
              <span className="text-gray-500">/register?ref=</span>
              <span className="text-green-400 font-semibold">{normalizedCode}</span>
            </>
          ) : (
            <span className="text-gray-500">کد معرف ثبت نشده</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {normalizedCode ? (
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={copying}
              className="px-3 h-10 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-600 active:bg-teal-800 whitespace-nowrap disabled:opacity-60"
            >
              {copying ? "..." : "کپی لینک"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.push(settingsPath)}
            className="px-3 h-10 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-600 active:bg-teal-800 whitespace-nowrap"
          >
            {hasReferralCode ? "تغییر کد معرف" : "ثبت کد معرف"}
          </button>
        </div>
      </div>
    </div>
  );
}
