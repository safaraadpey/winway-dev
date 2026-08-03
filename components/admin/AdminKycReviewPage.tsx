"use client";

import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  KYC_RETRY_REASONS,
  type KycRetryReasonCode,
} from "@/lib/kyc/retryReasons";
import {
  fetchAdminKycQueue,
  reviewAdminKyc,
} from "@/services/kyc-admin";
import type { AdminKycListItem } from "@/src/types/kyc";

export default function AdminKycReviewPage() {
  const [items, setItems] = useState<AdminKycListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<AdminKycListItem | null>(null);
  const [selectedReason, setSelectedReason] =
    useState<KycRetryReasonCode | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAdminKycQueue();
      setItems(data.items || []);
    } catch (err) {
      console.error("[KYC] Admin UI load failed", err);
      toast.error("بارگذاری صف احراز هویت ناموفق بود");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async (item: AdminKycListItem) => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await reviewAdminKyc({ submissionId: item.id, action: "approve" });
      toast.success("احراز هویت تأیید شد");
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (err) {
      console.error("[KYC] Approve failed", err);
      toast.error(
        err instanceof Error ? err.message : "تأیید احراز هویت ناموفق بود"
      );
    } finally {
      setBusyId(null);
    }
  };

  const openRetryModal = (item: AdminKycListItem) => {
    setRetryTarget(item);
    setSelectedReason(null);
  };

  const confirmRetry = async () => {
    if (!retryTarget || !selectedReason || busyId) return;
    setBusyId(retryTarget.id);
    try {
      await reviewAdminKyc({
        submissionId: retryTarget.id,
        action: "retry",
        reasonCode: selectedReason,
      });
      toast.success("درخواست تکرار احراز هویت ثبت شد");
      setItems((prev) => prev.filter((x) => x.id !== retryTarget.id));
      setRetryTarget(null);
      setSelectedReason(null);
    } catch (err) {
      console.error("[KYC] Retry request failed", err);
      toast.error(
        err instanceof Error ? err.message : "ثبت تکرار احراز هویت ناموفق بود"
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0f] text-white p-4 pb-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">احراز هویت</h1>
        <p className="text-sm text-gray-400 text-center mb-6">
          بررسی تصاویر ارسالی بازیکنان
        </p>

        {loading ? (
          <p className="text-center text-gray-400 py-10">در حال بارگذاری…</p>
        ) : items.length === 0 ? (
          <p className="text-center text-gray-400 py-10">
            درخواست در انتظار بررسی وجود ندارد.
          </p>
        ) : (
          <div className="space-y-5">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-gray-800 bg-[#151515] overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageDataUrl}
                  alt={`KYC ${item.username}`}
                  className="w-full max-h-[420px] object-contain bg-black"
                />
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-400">کد یکتا</span>
                    <span
                      className="numeric-text numeric-text--14 text-amber-300"
                      dir="ltr"
                    >
                      {item.kycCode}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-400">نام کاربری</span>
                    <span className="font-semibold">{item.username}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-400">ایجنت بالاسری</span>
                    <span>{item.agentUsername || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-400">سوپر بالاسری</span>
                    <span>{item.superUsername || "—"}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleApprove(item)}
                      className="rounded-xl bg-teal-500 text-black font-bold py-3 disabled:opacity-50"
                    >
                      تأیید احراز هویت
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => openRetryModal(item)}
                      className="rounded-xl border border-amber-500/60 text-amber-300 font-bold py-3 disabled:opacity-50"
                    >
                      تکرار احراز هویت
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {retryTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0b1120] border border-gray-700 p-5">
            <h2 className="text-lg font-bold mb-1 text-center">
              دلیل تکرار احراز هویت
            </h2>
            <p className="text-xs text-gray-400 text-center mb-4">
              کاربر: {retryTarget.username}
            </p>
            <div className="space-y-2 mb-4">
              {KYC_RETRY_REASONS.map((reason) => {
                const selected = selectedReason === reason.code;
                return (
                  <button
                    key={reason.code}
                    type="button"
                    onClick={() => setSelectedReason(reason.code)}
                    className={`w-full text-right rounded-xl px-4 py-3 border transition ${
                      selected
                        ? "border-teal-400 bg-teal-500/15 text-white"
                        : "border-gray-700 bg-[#151515] text-gray-200"
                    }`}
                  >
                    {reason.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-xl border border-gray-600 py-3"
                onClick={() => {
                  setRetryTarget(null);
                  setSelectedReason(null);
                }}
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={!selectedReason || busyId === retryTarget.id}
                className="rounded-xl bg-amber-500 text-black font-bold py-3 disabled:opacity-50"
                onClick={() => void confirmRetry()}
              >
                ثبت
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
