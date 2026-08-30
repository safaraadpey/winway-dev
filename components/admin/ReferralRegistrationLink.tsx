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
  const [sharing, setSharing] = useState(false);
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

  const handleShare = async () => {
    if (sharing || !fullLink) return;

    setSharing(true);
    try {
      const title = "لینک ثبت‌نام";
      const text = "برای ثبت‌نام با کد معرف من از این لینک استفاده کنید";

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ title, text, url: fullLink });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullLink);
        toast.success("لینک ثبت‌نام کپی شد");
        return;
      }

      toast.error("مرورگر از اشتراک‌گذاری پشتیبانی نمی‌کند");
    } catch {
      toast.error("خطا در اشتراک‌گذاری لینک");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-700 bg-[#151515] p-3 mb-3">
      <div className="text-white text-xs mb-2 text-right">
        از اینجا میتوانید{" "}
        <span className="text-green-400 font-semibold">لینک ثبت نام</span>{" "}
        را برای زیر مجموعه خود ارسال کنید
      </div>
      <div className="flex items-center gap-2">
        <div
          className="flex-1 min-w-0 h-11 rounded-lg bg-[#1f1f1f] border border-gray-700 flex items-center justify-end px-3 font-mono overflow-hidden"
          title={fullLink || undefined}
        >
          {normalizedCode ? (
            <div className="min-w-0 max-w-full truncate text-[17px] text-green-400 font-semibold font-mono" dir="ltr">
              {normalizedCode}
            </div>
          ) : (
            <span className="text-[17px] text-gray-500 w-full text-right">کد معرف ثبت نشده</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {normalizedCode ? (
            <>
              <button
                type="button"
                onClick={() => void handleShare()}
                disabled={sharing}
                className="px-3 h-10 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-600 active:bg-blue-800 whitespace-nowrap disabled:opacity-60"
              >
                {sharing ? "..." : "ارسال لینک"}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={copying}
                className="px-3 h-10 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-600 active:bg-teal-800 whitespace-nowrap disabled:opacity-60"
              >
                {copying ? "..." : "کپی لینک"}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => router.push(settingsPath)}
            className="px-3 h-10 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-600 active:bg-teal-800 whitespace-nowrap"
          >
            {hasReferralCode ? "تغییر کد" : "ثبت کد معرف"}
          </button>
        </div>
      </div>
    </div>
  );
}
