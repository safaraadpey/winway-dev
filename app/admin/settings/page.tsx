"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getCurrentReferralCode,
  getReferralCodeHistory,
  updateReferralCode,
  validateReferralCodeFormat,
  checkReferralCodeAvailable,
  ReferralCodeHistoryItem,
} from "@/lib/auth-helpers";
import { clearDashboardCache } from "@/services/dashboard";
import toast from "react-hot-toast";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";

export default function AdminSettingsPage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [history, setHistory] = useState<ReferralCodeHistoryItem[]>([]);
  const [newCode, setNewCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorHint, setErrorHint] = useState<string | null>(null);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.back());

    return () => {
      setShowHeader(false);
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick, router]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [code, historyData] = await Promise.all([
        getCurrentReferralCode(),
        getReferralCodeHistory(),
      ]);
      setCurrentCode(code);
      setHistory(historyData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("خطا در بارگذاری اطلاعات");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setNewCode(value);
    if (errorHint) setErrorHint(null);
  };

  const handleSaveNewCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!validateReferralCodeFormat(newCode)) {
      setErrorHint("کد باید 3 تا 8 کاراکتر و فقط شامل حروف و اعداد انگلیسی باشد");
      return;
    }

    if (currentCode && newCode.toUpperCase() === currentCode.toUpperCase()) {
      setErrorHint("این کد در حال حاضر فعال است");
      return;
    }

    setSaving(true);
    setErrorHint(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setErrorHint("کاربر پیدا نشد");
        return;
      }

      const isAvailable = await checkReferralCodeAvailable(newCode, user.id);
      if (!isAvailable) {
        setErrorHint("این کد قبلاً استفاده شده است. لطفاً کد دیگری انتخاب کنید");
        return;
      }

      const success = await updateReferralCode(newCode);
      if (success) {
        clearDashboardCache();
        toast.success("کد معرف با موفقیت ثبت شد");
        setNewCode("");
        await loadData();
      } else {
        setErrorHint("خطا در ثبت کد. لطفاً دوباره تلاش کنید");
      }
    } catch (error) {
      console.error("Error saving code:", error);
      setErrorHint("خطا در ثبت کد. لطفاً دوباره تلاش کنید");
    } finally {
      setSaving(false);
    }
  };

  const handleRevertToCode = async (code: string) => {
    if (code === currentCode) {
      toast("این کد در حال حاضر فعال است");
      return;
    }

    setSaving(true);
    try {
      const success = await updateReferralCode(code);
      if (success) {
        clearDashboardCache();
        toast.success("کد معرف با موفقیت تغییر کرد");
        await loadData();
      } else {
        toast.error("این کد در حال حاضر استفاده می‌شود");
      }
    } catch (error) {
      console.error("Error reverting code:", error);
      toast.error("خطا در تغییر کد");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] p-4">
        <div className="flex items-center justify-center h-64">
          <div className="text-white">در حال بارگذاری...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">تنظیمات کد معرف</h1>

        <div className="bg-[#3a3a3a] rounded-lg p-4 mb-4">
          <h2 className="text-lg font-semibold text-white mb-2">کد فعلی</h2>
          {currentCode ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-yellow-400">{currentCode}</span>
              <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">فعال</span>
            </div>
          ) : (
            <p className="text-gray-400">کد معرفی تنظیم نشده است</p>
          )}
        </div>

        <div className="bg-[#3a3a3a] rounded-lg p-4 mb-4">
          <h2 className="text-lg font-semibold text-white mb-4">
            {currentCode ? "تغییر کد معرف" : "ثبت کد معرف"}
          </h2>
          <form onSubmit={(e) => void handleSaveNewCode(e)} className="space-y-3">
            <div>
              <label htmlFor="referral-code" className="block text-sm text-gray-300 mb-2">
                کد جدید (3-8 کاراکتر، حروف و اعداد)
              </label>
              <input
                id="referral-code"
                type="text"
                value={newCode}
                onChange={handleCodeChange}
                maxLength={8}
                placeholder="مثلاً: ABC123"
                autoComplete="off"
                dir="ltr"
                className="w-full px-4 py-2 bg-[#1f2933] text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:outline-none font-mono text-left"
                disabled={saving}
              />
              {errorHint ? (
                <p className="text-red-400 text-xs mt-2">{errorHint}</p>
              ) : (
                <p className="text-xs text-gray-400 mt-2">فقط حروف انگلیسی و اعداد مجاز است</p>
              )}
            </div>
            <button
              type="submit"
              disabled={saving || !newCode}
              className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {saving ? "در حال ثبت..." : currentCode ? "ثبت تغییر" : "ثبت کد معرف"}
            </button>
          </form>
        </div>

        {history.length > 0 && (
          <div className="bg-[#3a3a3a] rounded-lg p-4">
            <h2 className="text-lg font-semibold text-white mb-4">تاریخچه کدها</h2>
            <div className="space-y-2">
              {history.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-[#1f2933] rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-mono text-yellow-400">
                      {item.referral_code}
                    </span>
                    {item.is_current && (
                      <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                        فعال
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(item.changed_at).toLocaleDateString("fa-IR")}
                    </span>
                  </div>
                  {!item.is_current && (
                    <button
                      onClick={() => handleRevertToCode(item.referral_code)}
                      disabled={saving}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? "..." : "بازگشت"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
