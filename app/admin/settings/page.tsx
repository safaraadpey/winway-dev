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
  const [checking, setChecking] = useState(false);

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
  };

  const handleCheckAvailability = async () => {
    if (!newCode || !validateReferralCodeFormat(newCode)) {
      toast.error("کد باید 3-8 کاراکتر و فقط حروف و اعداد باشد");
      return;
    }

    setChecking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("کاربر پیدا نشد");
        return;
      }

      const isAvailable = await checkReferralCodeAvailable(newCode, user.id);
      if (isAvailable) {
        toast.success("این کد قابل استفاده است");
      } else {
        toast.error("این کد در حال حاضر استفاده می‌شود");
      }
    } catch (error) {
      console.error("Error checking availability:", error);
      toast.error("خطا در بررسی کد");
    } finally {
      setChecking(false);
    }
  };

  const handleSaveNewCode = async () => {
    if (!newCode || !validateReferralCodeFormat(newCode)) {
      toast.error("کد باید 3-8 کاراکتر و فقط حروف و اعداد باشد");
      return;
    }

    setSaving(true);
    try {
      const success = await updateReferralCode(newCode);
      if (success) {
        clearDashboardCache();
        toast.success("کد معرف با موفقیت تغییر کرد");
        setNewCode("");
        await loadData();
      } else {
        toast.error("خطا در تغییر کد. لطفاً دوباره تلاش کنید");
      }
    } catch (error) {
      console.error("Error saving code:", error);
      toast.error("خطا در ذخیره کد");
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
        toast.error("خطا در تغییر کد. ممکن است کد توسط کاربر دیگری استفاده شود");
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

        {/* کد فعلی */}
        <div className="bg-[#3a3a3a] rounded-lg p-4 mb-4">
          <h2 className="text-lg font-semibold text-white mb-2">کد فعلی</h2>
          {currentCode ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-yellow-400">{currentCode}</span>
              <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                فعال
              </span>
            </div>
          ) : (
            <p className="text-gray-400">کد معرفی تنظیم نشده است</p>
          )}
        </div>

        {/* ثبت کد جدید */}
        <div className="bg-[#3a3a3a] rounded-lg p-4 mb-4">
          <h2 className="text-lg font-semibold text-white mb-4">ثبت کد جدید</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-300 mb-2">
                کد جدید (3-8 کاراکتر، حروف و اعداد)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCode}
                  onChange={handleCodeChange}
                  maxLength={8}
                  placeholder="مثلاً: ABC123"
                  className="flex-1 px-4 py-2 bg-[#1f2933] text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  disabled={saving}
                />
                <button
                  onClick={handleCheckAvailability}
                  disabled={checking || !newCode}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checking ? "..." : "بررسی"}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                فقط حروف انگلیسی و اعداد مجاز است
              </p>
            </div>
            <button
              onClick={handleSaveNewCode}
              disabled={saving || !newCode || !validateReferralCodeFormat(newCode)}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "در حال ذخیره..." : "ذخیره کد جدید"}
            </button>
          </div>
        </div>

        {/* تاریخچه کدها */}
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

