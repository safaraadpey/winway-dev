"use client";

import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { callAdminApi } from "@/lib/adminApiClient";

type Network = "BEP20" | "TRC20" | "TRX";
type TabId = "rial" | "tiers" | "xpub";

type TierRow = {
  key: string;
  id?: string;
  network: Network;
  minUsd: string;
  maxUsd: string;
  multiplier: string;
  bonusPercent: string;
  sortOrder: string;
  isActive: boolean;
};

type RialPresetRow = {
  key: string;
  id?: string;
  amountRial: string;
  sortOrder: string;
  isActive: boolean;
};

const NETWORKS: Network[] = ["BEP20", "TRC20", "TRX"];

function newTierRow(partial?: Partial<TierRow>): TierRow {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    network: "BEP20",
    minUsd: "0",
    maxUsd: "100",
    multiplier: "1.00",
    bonusPercent: "0",
    sortOrder: "10",
    isActive: true,
    ...partial,
  };
}

function fromTierApi(t: any): TierRow {
  return {
    key: String(t.id),
    id: String(t.id),
    network: t.network as Network,
    minUsd: String(t.minUsd),
    maxUsd: String(t.maxUsd),
    multiplier: String(t.multiplier),
    bonusPercent: String(t.bonusPercent ?? 0),
    sortOrder: String(t.sortOrder ?? 0),
    isActive: t.isActive !== false,
  };
}

function newRialRow(partial?: Partial<RialPresetRow>): RialPresetRow {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    amountRial: "",
    sortOrder: "10",
    isActive: true,
    ...partial,
  };
}

function fromRialApi(p: any): RialPresetRow {
  return {
    key: String(p.id),
    id: String(p.id),
    amountRial: String(p.amountRial),
    sortOrder: String(p.sortOrder ?? 0),
    isActive: p.isActive !== false,
  };
}

function formatRialPreview(raw: string): string {
  const n = Number(String(raw).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("en-US");
}

export default function CryptoPaymentManager() {
  const [activeTab, setActiveTab] = useState<TabId>("rial");
  const [rows, setRows] = useState<TierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rialRows, setRialRows] = useState<RialPresetRow[]>([]);
  const [rialLoading, setRialLoading] = useState(true);
  const [rialSaving, setRialSaving] = useState(false);

  const [canManageXpub, setCanManageXpub] = useState(false);
  const [xpubLoading, setXpubLoading] = useState(false);
  const [xpubSaving, setXpubSaving] = useState(false);
  const [bep20Xpub, setBep20Xpub] = useState("");
  const [trc20Xpub, setTrc20Xpub] = useState("");
  const [bep20Confirmations, setBep20Confirmations] = useState("12");
  const [tronConfirmations, setTronConfirmations] = useState("1");
  const [xpubUpdatedAt, setXpubUpdatedAt] = useState<string | null>(null);

  const loadXpub = useCallback(async () => {
    setXpubLoading(true);
    try {
      const data = await callAdminApi<{
        bep20Xpub: string | null;
        trc20Xpub: string | null;
        bep20Confirmations?: number;
        tronConfirmations?: number;
        updatedAt: string | null;
      }>("/api/admin/crypto-payment/xpub", { method: "GET" });
      setCanManageXpub(true);
      setBep20Xpub(data.bep20Xpub ?? "");
      setTrc20Xpub(data.trc20Xpub ?? "");
      setBep20Confirmations(String(data.bep20Confirmations ?? 12));
      setTronConfirmations(String(data.tronConfirmations ?? 1));
      setXpubUpdatedAt(data.updatedAt ?? null);
    } catch (e: any) {
      if (e?.statusCode === 403) {
        setCanManageXpub(false);
        return;
      }
      console.error("[Payment] admin load xpub failed", e);
      toast.error(e?.message || "بارگذاری XPUB ناموفق بود");
    } finally {
      setXpubLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callAdminApi<{ tiers: any[] }>(
        "/api/admin/crypto-payment/tiers",
        { method: "GET" }
      );
      setRows((data.tiers || []).map(fromTierApi));
    } catch (e: any) {
      console.error("[Payment] admin load crypto tiers failed", e);
      toast.error(e?.message || "بارگذاری ضرایب ناموفق بود");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRialPresets = useCallback(async () => {
    setRialLoading(true);
    try {
      const data = await callAdminApi<{ presets: any[] }>(
        "/api/admin/crypto-payment/rial-presets",
        { method: "GET" }
      );
      setRialRows((data.presets || []).map(fromRialApi));
    } catch (e: any) {
      console.error("[Payment] admin load rial presets failed", e);
      toast.error(e?.message || "بارگذاری مبالغ ریالی ناموفق بود");
    } finally {
      setRialLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadXpub();
    void loadRialPresets();
  }, [load, loadXpub, loadRialPresets]);

  const handleSaveXpub = async () => {
    if (!bep20Xpub.trim() || !trc20Xpub.trim()) {
      toast.error("هر دو XPUB الزامی هستند");
      return;
    }
    const bepConf = Number(bep20Confirmations);
    const tronConf = Number(tronConfirmations);
    if (
      !Number.isFinite(bepConf) ||
      bepConf < 1 ||
      bepConf > 256 ||
      !Number.isFinite(tronConf) ||
      tronConf < 1 ||
      tronConf > 256
    ) {
      toast.error("تعداد تأییدیه باید بین ۱ تا ۲۵۶ باشد");
      return;
    }
    setXpubSaving(true);
    try {
      const data = await callAdminApi<{
        bep20Xpub: string | null;
        trc20Xpub: string | null;
        bep20Confirmations?: number;
        tronConfirmations?: number;
        updatedAt: string | null;
      }>("/api/admin/crypto-payment/xpub", {
        method: "PUT",
        body: {
          bep20Xpub: bep20Xpub.trim(),
          trc20Xpub: trc20Xpub.trim(),
          bep20Confirmations: Math.floor(bepConf),
          tronConfirmations: Math.floor(tronConf),
        },
      });
      setBep20Xpub(data.bep20Xpub ?? "");
      setTrc20Xpub(data.trc20Xpub ?? "");
      setBep20Confirmations(String(data.bep20Confirmations ?? bepConf));
      setTronConfirmations(String(data.tronConfirmations ?? tronConf));
      setXpubUpdatedAt(data.updatedAt ?? null);
      toast.success("تنظیمات XPUB و تأییدیه ذخیره شد");
    } catch (e: any) {
      console.error("[Payment] admin save xpub failed", e);
      toast.error(e?.message || "ذخیره XPUB ناموفق بود");
    } finally {
      setXpubSaving(false);
    }
  };

  const updateRow = (key: string, patch: Partial<TierRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const updateRialRow = (key: string, patch: Partial<RialPresetRow>) => {
    setRialRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  };

  const removeRialRow = (key: string) => {
    setRialRows((prev) => prev.filter((r) => r.key !== key));
  };

  const handleSaveRialPresets = async () => {
    if (rialRows.length === 0) {
      toast.error("حداقل یک مبلغ لازم است");
      return;
    }

    for (const r of rialRows) {
      const amount = Number(String(r.amountRial).replace(/[^\d]/g, ""));
      if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
        toast.error("مبلغ ریالی نامعتبر است");
        return;
      }
    }

    setRialSaving(true);
    try {
      const payload = {
        presets: rialRows.map((r, i) => ({
          id: r.id,
          amountRial: Number(String(r.amountRial).replace(/[^\d]/g, "")),
          sortOrder: Number(r.sortOrder || (i + 1) * 10),
          isActive: r.isActive,
        })),
      };
      const data = await callAdminApi<{ presets: any[] }>(
        "/api/admin/crypto-payment/rial-presets",
        { method: "PUT", body: payload }
      );
      setRialRows((data.presets || []).map(fromRialApi));
      toast.success("مبالغ خرید ریال ذخیره شد");
    } catch (e: any) {
      console.error("[Payment] admin save rial presets failed", e);
      toast.error(e?.message || "ذخیره مبالغ ناموفق بود");
    } finally {
      setRialSaving(false);
    }
  };

  const handleSave = async () => {
    if (rows.length === 0) {
      toast.error("حداقل یک ردیف لازم است");
      return;
    }

    for (const r of rows) {
      const minUsd = Number(r.minUsd);
      const maxUsd = Number(r.maxUsd);
      const multiplier = Number(r.multiplier);
      const bonusPercent = Number(r.bonusPercent);
      if (!(minUsd >= 0) || !(maxUsd > minUsd)) {
        toast.error(`بازه نامعتبر برای ${r.network}`);
        return;
      }
      if (!(multiplier > 0) || multiplier > 10) {
        toast.error(`ضریب نامعتبر برای ${r.network}`);
        return;
      }
      if (!(bonusPercent >= 0) || bonusPercent > 100) {
        toast.error(`بونوس نامعتبر برای ${r.network}`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        tiers: rows.map((r, i) => ({
          id: r.id,
          network: r.network,
          minUsd: Number(r.minUsd),
          maxUsd: Number(r.maxUsd),
          multiplier: Number(r.multiplier),
          bonusPercent: Number(r.bonusPercent || 0),
          sortOrder: Number(r.sortOrder || (i + 1) * 10),
          isActive: r.isActive,
        })),
      };
      const data = await callAdminApi<{ tiers: any[] }>(
        "/api/admin/crypto-payment/tiers",
        { method: "PUT", body: payload }
      );
      setRows((data.tiers || []).map(fromTierApi));
      toast.success("ضرایب ذخیره شد");
    } catch (e: any) {
      console.error("[Payment] admin save crypto tiers failed", e);
      toast.error(e?.message || "ذخیره ناموفق بود");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-center text-xl font-bold text-white">
          مدیریت پرداخت
        </h1>
        <p className="mb-5 text-center text-sm leading-6 text-gray-400">
          مبالغ خرید ریال، ضرایب پلکانی کریپتو و کلیدهای XPUB پایه.
        </p>

        <div className="mb-5 grid grid-cols-3 gap-2 rounded-xl bg-[#151515] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("rial")}
            className={`rounded-lg py-2.5 text-sm font-semibold ${
              activeTab === "rial" ? "bg-teal-500 text-black" : "text-gray-300"
            }`}
          >
            مبالغ ریال
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tiers")}
            className={`rounded-lg py-2.5 text-sm font-semibold ${
              activeTab === "tiers" ? "bg-teal-500 text-black" : "text-gray-300"
            }`}
          >
            ضرایب پلکانی
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("xpub")}
            disabled={!canManageXpub && !xpubLoading}
            className={`rounded-lg py-2.5 text-sm font-semibold ${
              activeTab === "xpub" ? "bg-teal-500 text-black" : "text-gray-300"
            } disabled:opacity-40`}
          >
            XPUB
            {!canManageXpub && !xpubLoading ? " (کل)" : ""}
          </button>
        </div>

        {activeTab === "rial" ? (
          rialLoading ? (
            <p className="text-center text-gray-400">در حال بارگذاری…</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setRialRows((prev) => [
                      ...prev,
                      newRialRow({
                        sortOrder: String((prev.length + 1) * 10),
                      }),
                    ])
                  }
                  className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
                >
                  + افزودن مبلغ
                </button>
                <button
                  type="button"
                  onClick={() => void loadRialPresets()}
                  className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200"
                >
                  بارگذاری مجدد
                </button>
                <button
                  type="button"
                  disabled={rialSaving}
                  onClick={() => void handleSaveRialPresets()}
                  className="mr-auto rounded-lg bg-teal-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
                >
                  {rialSaving ? "در حال ذخیره…" : "ذخیره تغییرات"}
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full min-w-[520px] text-right text-sm text-gray-100">
                  <thead className="bg-[#151515] text-xs text-gray-400">
                    <tr>
                      <th className="px-2 py-3">مبلغ (ریال)</th>
                      <th className="px-2 py-3">پیش‌نمایش</th>
                      <th className="px-2 py-3">ترتیب</th>
                      <th className="px-2 py-3">فعال</th>
                      <th className="px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rialRows.map((r) => (
                      <tr key={r.key} className="border-t border-gray-800">
                        <td className="px-2 py-2">
                          <input
                            dir="ltr"
                            inputMode="numeric"
                            value={r.amountRial}
                            onChange={(e) =>
                              updateRialRow(r.key, {
                                amountRial: e.target.value.replace(/[^\d]/g, ""),
                              })
                            }
                            className="w-full rounded-md border border-gray-700 bg-[#1a1a1a] px-2 py-1.5 font-mono text-sm"
                            placeholder="530000"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className="numeric-text numeric-text--14 text-gray-300"
                            dir="ltr"
                          >
                            {formatRialPreview(r.amountRial)
                              ? `${formatRialPreview(r.amountRial)} ریال`
                              : "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            dir="ltr"
                            inputMode="numeric"
                            value={r.sortOrder}
                            onChange={(e) =>
                              updateRialRow(r.key, {
                                sortOrder: e.target.value.replace(/[^\d-]/g, ""),
                              })
                            }
                            className="w-full rounded-md border border-gray-700 bg-[#1a1a1a] px-2 py-1.5 font-mono text-sm"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={r.isActive}
                            onChange={(e) =>
                              updateRialRow(r.key, {
                                isActive: e.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeRialRow(r.key)}
                            className="rounded-md bg-red-900/60 px-2 py-1 text-xs text-red-200"
                          >
                            حذف
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-xs leading-5 text-gray-500">
                این مبالغ در لیست «انتخاب مبلغ» صفحه خرید ریال نمایش داده
                می‌شوند. ردیف‌های غیرفعال برای بازیکن دیده نمی‌شوند.
              </p>
            </>
          )
        ) : null}

        {activeTab === "xpub" && canManageXpub ? (
          <div className="mb-8 rounded-xl border border-amber-900/50 bg-[#151515] p-4">
            <h2 className="mb-1 text-base font-bold text-amber-200">
              کلیدهای XPUB و تاییدیه‌های شبکه
            </h2>
            <p className="mb-4 text-xs leading-5 text-gray-400">
              فقط مدیر کل. XPUB برای مشتق‌سازی آدرس؛ تعداد تأییدیه برای شارژ
              نهایی کیف پول. کلید خصوصی هرگز در سرور ذخیره نمی‌شود.
            </p>
            {xpubLoading ? (
              <p className="text-sm text-gray-400">در حال بارگذاری…</p>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm text-gray-300">
                    BEP-20 / BSC XPUB
                  </span>
                  <textarea
                    dir="ltr"
                    rows={2}
                    value={bep20Xpub}
                    onChange={(e) => setBep20Xpub(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-[#0E0E0F] px-3 py-2 font-mono text-xs text-gray-100"
                    placeholder="xpub6..."
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-gray-300">
                    TRC-20 / Tron XPUB
                  </span>
                  <textarea
                    dir="ltr"
                    rows={2}
                    value={trc20Xpub}
                    onChange={(e) => setTrc20Xpub(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-[#0E0E0F] px-3 py-2 font-mono text-xs text-gray-100"
                    placeholder="xpub6..."
                  />
                </label>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <label className="block">
                    <span className="mb-1 block text-sm text-gray-300">
                      BEP20_CONFIRMATIONS
                    </span>
                    <input
                      dir="ltr"
                      inputMode="numeric"
                      value={bep20Confirmations}
                      onChange={(e) =>
                        setBep20Confirmations(
                          e.target.value.replace(/[^\d]/g, "")
                        )
                      }
                      className="w-full rounded-lg border border-gray-700 bg-[#0E0E0F] px-3 py-2 font-mono text-sm text-gray-100"
                      placeholder="12"
                    />
                    <span className="mt-1 block text-[11px] text-gray-500">
                      حداقل تأییدیه BSC (پیشنهاد: ۱۲)
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm text-gray-300">
                      TRON_CONFIRMATIONS
                    </span>
                    <input
                      dir="ltr"
                      inputMode="numeric"
                      value={tronConfirmations}
                      onChange={(e) =>
                        setTronConfirmations(
                          e.target.value.replace(/[^\d]/g, "")
                        )
                      }
                      className="w-full rounded-lg border border-gray-700 bg-[#0E0E0F] px-3 py-2 font-mono text-sm text-gray-100"
                      placeholder="1"
                    />
                    <span className="mt-1 block text-[11px] text-gray-500">
                      حداقل تأییدیه ترون (پیشنهاد: ۱)
                    </span>
                  </label>
                </div>

                {xpubUpdatedAt ? (
                  <p className="text-xs text-gray-500">
                    آخرین بروزرسانی:{" "}
                    {new Date(xpubUpdatedAt).toLocaleString("fa-IR")}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={xpubSaving}
                  onClick={() => void handleSaveXpub()}
                  className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-black disabled:opacity-50"
                >
                  {xpubSaving ? "در حال ذخیره…" : "ذخیره XPUB و تاییدیه‌ها"}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "tiers" &&
          (loading ? (
            <p className="text-center text-gray-400">در حال بارگذاری…</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setRows((prev) => [
                      ...prev,
                      newTierRow({ sortOrder: String((prev.length + 1) * 10) }),
                    ])
                  }
                  className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
                >
                  + افزودن ردیف
                </button>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200"
                >
                  بارگذاری مجدد
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="mr-auto rounded-lg bg-teal-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
                >
                  {saving ? "در حال ذخیره…" : "ذخیره تغییرات"}
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full min-w-[720px] text-right text-sm text-gray-100">
                  <thead className="bg-[#151515] text-xs text-gray-400">
                    <tr>
                      <th className="px-2 py-3">شبکه</th>
                      <th className="px-2 py-3">از (USD)</th>
                      <th className="px-2 py-3">تا (USD)</th>
                      <th className="px-2 py-3">ضریب</th>
                      <th className="px-2 py-3">بونوس %</th>
                      <th className="px-2 py-3">ترتیب</th>
                      <th className="px-2 py-3">فعال</th>
                      <th className="px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-t border-gray-800">
                        <td className="px-2 py-2">
                          <select
                            value={r.network}
                            onChange={(e) =>
                              updateRow(r.key, {
                                network: e.target.value as Network,
                              })
                            }
                            className="w-full rounded-md border border-gray-700 bg-[#1a1a1a] px-2 py-1.5"
                          >
                            {NETWORKS.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </td>
                        {(
                          [
                            ["minUsd", r.minUsd],
                            ["maxUsd", r.maxUsd],
                            ["multiplier", r.multiplier],
                            ["bonusPercent", r.bonusPercent],
                            ["sortOrder", r.sortOrder],
                          ] as const
                        ).map(([field, value]) => (
                          <td key={field} className="px-2 py-2">
                            <input
                              dir="ltr"
                              inputMode="decimal"
                              value={value}
                              onChange={(e) =>
                                updateRow(r.key, { [field]: e.target.value })
                              }
                              className="w-full rounded-md border border-gray-700 bg-[#1a1a1a] px-2 py-1.5 font-mono text-sm"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={r.isActive}
                            onChange={(e) =>
                              updateRow(r.key, { isActive: e.target.checked })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeRow(r.key)}
                            className="rounded-md bg-red-900/60 px-2 py-1 text-xs text-red-200"
                          >
                            حذف
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-xs leading-5 text-gray-500">
                نمونه: BEP20 با ضریب کمتر از ۱ = تخفیف حجمی؛ TRC20 با ضریب بالای ۱
                = جبران کارمزد شبکه. بونوس٪ روی کارت فاکتور به کاربر نمایش داده
                می‌شود.
              </p>
            </>
          ))}
      </div>
    </div>
  );
}
