"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import {
  buildRegistrationLink,
  buildRegistrationLinkPath,
} from "@/lib/referral/buildRegistrationLink";

type ReferralRegistrationLinkProps = {
  referralCode: string;
};

export default function ReferralRegistrationLink({
  referralCode,
}: ReferralRegistrationLinkProps) {
  const [copying, setCopying] = useState(false);
  const linkPath = buildRegistrationLinkPath(referralCode);
  const fullLink = buildRegistrationLink(referralCode);

  const handleCopy = async () => {
    if (copying) return;

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
    <div className="flex items-end gap-2 pt-1 border-t border-gray-700/80">
      <div className="flex-1 min-w-0">
        <div className="text-gray-400 text-xs mb-1">لینک ثبت‌نام</div>
        <div
          className="w-full h-10 rounded-lg bg-[#1f1f1f] border border-gray-700 text-gray-100 flex items-center px-3 text-sm font-mono truncate dir-ltr text-left"
          title={fullLink}
        >
          {linkPath}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void handleCopy()}
        disabled={copying}
        className="px-3 h-10 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-600 active:bg-teal-800 whitespace-nowrap disabled:opacity-60"
      >
        {copying ? "..." : "کپی لینک"}
      </button>
    </div>
  );
}
