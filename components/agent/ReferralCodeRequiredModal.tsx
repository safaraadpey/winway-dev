"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { useSession } from "@/lib/contexts/SessionContext";
import { clearDashboardCache, loadDashboardUserInfo } from "@/services/dashboard";
import { publishReferralCodeUpdated } from "@/lib/referral/referralCodeEvents";
import {
  checkReferralCodeAvailable,
  updateReferralCode,
  validateReferralCodeFormat,
} from "@/lib/auth-helpers";

const HIDDEN_PATH_PREFIXES = ["/agent/login", "/agent/settings"];

function isHiddenPath(pathname: string): boolean {
  return HIDDEN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function ReferralCodeRequiredModal() {
  const pathname = usePathname();
  const { userId, authReady } = useSession();
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorHint, setErrorHint] = useState<string | null>(null);

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
        if (!needsReferralCode) {
          setNewCode("");
          setErrorHint(null);
        }
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

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setNewCode(value);
    if (errorHint) setErrorHint(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !userId) return;

    if (!validateReferralCodeFormat(newCode)) {
      setErrorHint("کد باید 3 تا 8 کاراکتر و فقط شامل حروف و اعداد انگلیسی باشد");
      return;
    }

    setSaving(true);
    setErrorHint(null);

    try {
      const isAvailable = await checkReferralCodeAvailable(newCode, userId);
      if (!isAvailable) {
        setErrorHint("این کد قبلاً استفاده شده است. لطفاً کد دیگری انتخاب کنید");
        return;
      }

      const success = await updateReferralCode(newCode);
      if (!success) {
        setErrorHint("خطا در ثبت کد. لطفاً دوباره تلاش کنید");
        return;
      }

      clearDashboardCache();
      publishReferralCodeUpdated(newCode);
      setShow(false);
      setNewCode("");
      toast.success("کد معرف با موفقیت ثبت شد");
    } catch (error) {
      console.error("[ReferralCodeRequiredModal] Failed to save referral code", error);
      setErrorHint("خطا در ثبت کد. لطفاً دوباره تلاش کنید");
    } finally {
      setSaving(false);
    }
  };

  if (checking || !show) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#0b1120] rounded-2xl p-6 w-full max-w-md border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-3">تنظیم کد معرف</h2>
        <p className="text-gray-300 text-sm leading-7 mb-4">
          قبل از شروع کار در پنل، کد معرف خود را وارد و ثبت کنید.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label htmlFor="referral-code-modal" className="block text-sm text-gray-300 mb-2">
              کد معرف (3-8 کاراکتر)
            </label>
            <input
              id="referral-code-modal"
              type="text"
              value={newCode}
              onChange={handleCodeChange}
              maxLength={8}
              placeholder="مثلاً: ABC123"
              autoComplete="off"
              dir="ltr"
              className="w-full px-4 py-3 bg-[#1f2933] text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:outline-none font-mono text-left"
              disabled={saving}
            />
            {errorHint ? (
              <p className="text-red-400 text-xs mt-2">{errorHint}</p>
            ) : (
              <p className="text-gray-500 text-xs mt-2">فقط حروف انگلیسی و اعداد مجاز است</p>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || !newCode}
            className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "در حال ثبت..." : "ثبت کد معرف"}
          </button>
        </form>
      </div>
    </div>
  );
}
