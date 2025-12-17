"use client";

import React, { useState } from "react";
import MergedPlayerHeader from "@/components/MergedPlayerHeader";

export default function TestMergedHeaderPage() {
  const [dingBalance, setDingBalance] = useState<number>(5770);
  const [tomanBalance, setTomanBalance] = useState<number>(397_785);
  const [loading, setLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showBackButton, setShowBackButton] = useState(true);

  return (
    <div className="min-h-screen bg-[#0E0E0F] text-white">
      <div className="sticky top-0 z-50 bg-[#0E0E0F]">
        <MergedPlayerHeader
          dingBalance={dingBalance}
          tomanBalance={tomanBalance}
          loading={loading}
          isAnimating={isAnimating}
          showBackButton={showBackButton}
          onBackClick={() => {
            // تست رفتار دکمه بازگشت بدون وابستگی به route
            // eslint-disable-next-line no-alert
            alert("Back clicked (test page)");
          }}
        />
      </div>

      <div className="mx-auto w-full max-w-[390px] px-4 pt-4 space-y-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-semibold mb-2">Test Controls</div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
              onClick={() => setLoading((v) => !v)}
            >
              loading: {String(loading)}
            </button>
            <button
              className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
              onClick={() => setIsAnimating((v) => !v)}
            >
              isAnimating: {String(isAnimating)}
            </button>
            <button
              className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
              onClick={() => setShowBackButton((v) => !v)}
            >
              showBackButton: {String(showBackButton)}
            </button>
            <button
              className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
              onClick={() => {
                setDingBalance((v) => v + 123);
                setTomanBalance((v) => v + 5_000);
              }}
            >
              + balances
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <label className="space-y-1">
              <div className="opacity-80">dingBalance</div>
              <input
                className="w-full rounded-md bg-black/30 px-2 py-1 outline-none ring-1 ring-white/10"
                type="number"
                value={dingBalance}
                onChange={(e) => setDingBalance(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <div className="opacity-80">tomanBalance</div>
              <input
                className="w-full rounded-md bg-black/30 px-2 py-1 outline-none ring-1 ring-white/10"
                type="number"
                value={tomanBalance}
                onChange={(e) => setTomanBalance(Number(e.target.value))}
              />
            </label>
          </div>
        </div>

        <div className="text-xs opacity-70">
          Note: avatar/name will load from Supabase auth if you are logged in.
        </div>
      </div>
    </div>
  );
}


