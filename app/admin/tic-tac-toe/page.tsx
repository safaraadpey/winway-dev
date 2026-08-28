"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  TIC_TAC_TOE_PLACEMENTS,
  type TicTacToePlacement,
} from "@/lib/tic-tac-toe/constants";
import type { TicTacToeSettings } from "@/lib/tic-tac-toe/types";
import { supabase } from "@/lib/supabaseClient";

const PLACEMENT_LABELS: Record<TicTacToePlacement, string> = {
  player_home: "منوی اصلی پلیر",
  player_lobby: "لابی بازی",
  player_header: "هدر پلیر",
};

export default function AdminTicTacToePage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } =
    useHeaderVisibility();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<TicTacToeSettings | null>(null);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/admin/dashboard"));

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setOnBackClick, setShowBackButton, setShowHeader]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error("Authentication required.");

        const response = await fetch("/api/admin/tic-tac-toe/settings", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.message || "Failed to load settings");
        }
        setSettings(payload.data);
      } catch (error) {
        console.error("[TicTacToe] admin load failed:", error);
        toast.error("خطا در بارگذاری تنظیمات دوز");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const togglePlacement = (placement: TicTacToePlacement) => {
    if (!settings) return;
    const next = settings.placements.includes(placement)
      ? settings.placements.filter((item) => item !== placement)
      : [...settings.placements, placement];
    setSettings({ ...settings, placements: next });
  };

  const handleSave = async () => {
    if (!settings || saving) return;

    try {
      setSaving(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication required.");

      const response = await fetch("/api/admin/tic-tac-toe/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          isEnabled: settings.isEnabled,
          winPrizeDing: settings.winPrizeDing,
          dailyWinCap: settings.dailyWinCap,
          placements: settings.placements,
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || "Failed to save settings");
      }

      setSettings(payload.data);
      toast.success("تنظیمات دوز ذخیره شد");
    } catch (error) {
      console.error("[TicTacToe] admin save failed:", error);
      toast.error(error instanceof Error ? error.message : "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] text-white p-4">
        <div className="max-w-md mx-auto py-12 text-center text-gray-400">
          در حال بارگذاری...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0E0F] text-white p-4">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-bold">مدیریت مینی‌گیم دوز</h1>
        <p className="text-sm text-gray-400 leading-6">
          بازی به‌صورت Popup در محیط پلیر اجرا می‌شود. منطق بازی سمت کلاینت است و
          پرداخت دینگ فقط پس از replay امن سرور انجام می‌شود.
        </p>

        <label className="flex items-center justify-between rounded-xl bg-[#1f2933] px-4 py-3">
          <span>فعال برای پلیرها</span>
          <input
            type="checkbox"
            checked={settings.isEnabled}
            onChange={(event) =>
              setSettings({ ...settings, isEnabled: event.target.checked })
            }
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-gray-300">جایزه برد (دینگ)</span>
          <input
            type="number"
            min={0}
            className="w-full rounded-xl bg-[#1f2933] px-4 py-3 outline-none"
            value={settings.winPrizeDing}
            onChange={(event) =>
              setSettings({
                ...settings,
                winPrizeDing: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-gray-300">سقف برد پرداخت‌شده در روز</span>
          <input
            type="number"
            min={0}
            className="w-full rounded-xl bg-[#1f2933] px-4 py-3 outline-none"
            value={settings.dailyWinCap}
            onChange={(event) =>
              setSettings({
                ...settings,
                dailyWinCap: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
        </label>

        <div className="space-y-2">
          <p className="text-sm text-gray-300">محل نمایش دکمه احضار Popup</p>
          <div className="space-y-2">
            {TIC_TAC_TOE_PLACEMENTS.map((placement) => (
              <label
                key={placement}
                className="flex items-center justify-between rounded-xl bg-[#1f2933] px-4 py-3"
              >
                <span>{PLACEMENT_LABELS[placement]}</span>
                <input
                  type="checkbox"
                  checked={settings.placements.includes(placement)}
                  onChange={() => togglePlacement(placement)}
                />
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold hover:bg-teal-700 disabled:opacity-60"
        >
          {saving ? "در حال ذخیره..." : "ذخیره تنظیمات"}
        </button>
      </div>
    </div>
  );
}
