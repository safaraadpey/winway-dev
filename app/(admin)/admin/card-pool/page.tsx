"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";

interface ActivePool {
  id: string;
  seed: string | null;
  commitHash: string | null;
  prngVersion: string | null;
  cardCount: number;
  createdAt: string;
  isBuilding: boolean;
  cardsBuilt: number;
}

interface PoolHistoryItem {
  id: string;
  seed: string | null;
  commitHash: string | null;
  cardCount: number;
  createdAt: string;
  isActive: boolean;
  isBuilding: boolean;
  cardsBuilt: number;
}

interface PoolStatus {
  poolId: string;
  cardCount: number;
  cardsBuilt: number;
  isBuilding: boolean;
  isActive: boolean;
  isComplete: boolean;
  progress: number;
}

export default function CardPoolPage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  
  const [activePool, setActivePool] = useState<ActivePool | null>(null);
  const [poolHistory, setPoolHistory] = useState<PoolHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardCount, setCardCount] = useState(500);
  const [generating, setGenerating] = useState(false);
  const [currentPoolStatus, setCurrentPoolStatus] = useState<PoolStatus | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [copiedSeed, setCopiedSeed] = useState<string | null>(null);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.back());

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick, router, pollingInterval]);

  // بارگذاری اطلاعات استخر فعال و سوابق
  const loadPoolData = async () => {
    try {
      setLoading(true);
      
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        router.push("/login");
        return;
      }

      const token = session.data.session.access_token;

      // دریافت استخر فعال
      const activeResponse = await fetch("/api/admin/card-pool/active", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (activeResponse.ok) {
        const activeData = await activeResponse.json();
        if (activeData.ok && activeData.pool) {
          setActivePool(activeData.pool);
          
          // اگر استخر در حال ساخت است، شروع به polling می‌کنیم
          if (activeData.pool.isBuilding) {
            startPolling(activeData.pool.id);
          }
        } else {
          setActivePool(null);
        }
      }

      // دریافت سوابق
      const historyResponse = await fetch("/api/admin/card-pool/history", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        if (historyData.ok && historyData.pools) {
          setPoolHistory(historyData.pools);
        }
      }
    } catch (error) {
      console.error("Error loading pool data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPoolData();
  }, []);

  // شروع polling برای دریافت وضعیت ساخت
  const startPolling = (poolId: string) => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    const interval = setInterval(async () => {
      try {
        const session = await supabase.auth.getSession();
        if (!session.data.session) return;

        const token = session.data.session.access_token;
        const statusResponse = await fetch(
          `/api/admin/card-pool/status?poolId=${poolId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          if (statusData.ok && statusData.status) {
            setCurrentPoolStatus(statusData.status);

            // اگر ساخت تمام شد، polling را متوقف می‌کنیم و داده‌ها را refresh می‌کنیم
            if (statusData.status.isComplete) {
              clearInterval(interval);
              setPollingInterval(null);
              loadPoolData(); // refresh داده‌ها
            }
          }
        }
      } catch (error) {
        console.error("Error polling pool status:", error);
      }
    }, 2000); // هر 2 ثانیه یکبار

    setPollingInterval(interval);
  };

  // تولید استخر جدید
  const handleGenerate = async () => {
    if (generating) return;

    try {
      setGenerating(true);

      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        router.push("/login");
        return;
      }

      const token = session.data.session.access_token;

      const response = await fetch("/api/admin/card-pool/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cardCount }),
      });

      const data = await response.json();

      if (data.ok && data.poolId) {
        // شروع polling برای استخر جدید
        startPolling(data.poolId);
        // refresh داده‌ها
        await loadPoolData();
        alert("تولید استخر کارت با موفقیت آغاز شد");
      } else {
        alert(data.message || "خطا در تولید استخر کارت");
      }
    } catch (error) {
      console.error("Error generating pool:", error);
      alert("خطا در تولید استخر کارت");
    } finally {
      setGenerating(false);
    }
  };

  // دانلود اطلاعات کارت
  const handleDownload = async (poolId: string) => {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        router.push("/login");
        return;
      }

      const token = session.data.session.access_token;

      const response = await fetch(
        `/api/admin/card-pool/download?poolId=${poolId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `card-pool-${poolId.substring(0, 8)}-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert("خطا در دانلود اطلاعات کارت");
      }
    } catch (error) {
      console.error("Error downloading cards:", error);
      alert("خطا در دانلود اطلاعات کارت");
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  };

  const formatSeed = (seed: string | null): string => {
    if (!seed) return "نامشخص";
    if (seed.length > 32) {
      return `${seed.substring(0, 16)}...${seed.substring(seed.length - 8)}`;
    }
    return seed;
  };

  const copyToClipboard = async (text: string, seedId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSeed(seedId);
      setTimeout(() => setCopiedSeed(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopiedSeed(seedId);
        setTimeout(() => setCopiedSeed(null), 2000);
      } catch (err) {
        console.error("Fallback copy failed:", err);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] text-white p-4">
      <style jsx>{`
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
        }
        input[type="range"]::-webkit-slider-track {
          height: 8px;
          border-radius: 4px;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          background: #14b8a6;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          cursor: pointer;
          margin-top: -6px;
          transition: background 0.2s;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          background: #0d9488;
        }
        input[type="range"]::-moz-range-track {
          height: 8px;
          border-radius: 4px;
          border: none;
        }
        input[type="range"]::-moz-range-thumb {
          background: #14b8a6;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          cursor: pointer;
          border: none;
          transition: background 0.2s;
        }
        input[type="range"]::-moz-range-thumb:hover {
          background: #0d9488;
        }
      `}</style>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">مدیریت استخر کارت</h1>

        {loading ? (
          <div className="text-center py-8 text-gray-400">در حال بارگذاری...</div>
        ) : (
          <>
            {/* بخش استخر فعال */}
            <div className="bg-[#1f2933] rounded-2xl p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">استخر فعال</h2>
              {activePool ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">شناسه:</span>
                    <span className="font-mono text-sm">{activePool.id.substring(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Seed:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{formatSeed(activePool.seed)}</span>
                      {activePool.seed && (
                        <button
                          onClick={() => copyToClipboard(activePool.seed!, activePool.id)}
                          className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                          title="کپی به کلیپ‌بورد"
                        >
                          {copiedSeed === activePool.id ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 text-green-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 text-gray-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">تعداد کارت:</span>
                    <span>{activePool.cardCount.toLocaleString("fa-IR")}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">تاریخ تولید:</span>
                    <span>{formatDate(activePool.createdAt)}</span>
                  </div>
                  <button
                    onClick={() => handleDownload(activePool.id)}
                    className="w-full mt-4 px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
                    disabled={activePool.isBuilding}
                  >
                    {activePool.isBuilding ? "در حال ساخت..." : "دانلود اطلاعات کارت"}
                  </button>
                </div>
              ) : (
                <div className="text-gray-400 text-center py-4">
                  استخر فعالی وجود ندارد
                </div>
              )}
            </div>

            {/* بخش تولید استخر جدید */}
            <div className="bg-[#1f2933] rounded-2xl p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">تولید مخزن کارت جدید</h2>
              
              {/* انتخاب تعداد کارت */}
              <div className="mb-4">
                <label className="block text-gray-300 mb-3">تعداد کارت:</label>
                <div className="space-y-3">
                  {/* Slider */}
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="10000"
                      step="100"
                      value={cardCount}
                      onChange={(e) => setCardCount(Number(e.target.value))}
                      className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #14b8a6 0%, #14b8a6 ${(cardCount / 10000) * 100}%, #374151 ${(cardCount / 10000) * 100}%, #374151 100%)`
                      }}
                    />
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      value={cardCount}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(10000, Number(e.target.value)));
                        setCardCount(val);
                      }}
                      className="w-24 px-3 py-2 rounded-lg bg-[#0E0E0F] border border-gray-700 text-white text-center"
                    />
                  </div>
                  <div className="text-xs text-gray-400 text-center">
                    حداقل: 0 | حداکثر: 10000 | پیش‌فرض: 500
                  </div>
                </div>
              </div>

              {/* دکمه تولید */}
              <button
                onClick={handleGenerate}
                disabled={generating || (activePool?.isBuilding ?? false)}
                className="w-full px-4 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                {generating
                  ? "در حال تولید..."
                  : activePool?.isBuilding
                  ? "استخر دیگری در حال ساخت است"
                  : "تولید مخزن کارت جدید"}
              </button>

              {/* نمایش وضعیت ساخت */}
              {(activePool?.isBuilding || currentPoolStatus?.isBuilding) && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">تعداد کارت‌های تولید شده:</span>
                    <span className="font-semibold">
                      {(currentPoolStatus?.cardsBuilt ?? activePool?.cardsBuilt ?? 0).toLocaleString("fa-IR")} /{" "}
                      {(currentPoolStatus?.cardCount ?? activePool?.cardCount ?? 0).toLocaleString("fa-IR")}
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-teal-500 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${
                          currentPoolStatus?.progress ?? 
                          (activePool?.cardCount
                            ? Math.round(((activePool.cardsBuilt || 0) / activePool.cardCount) * 100)
                            : 0)
                        }%`,
                      }}
                    />
                  </div>
                  {currentPoolStatus?.isComplete && (
                    <div className="text-center text-teal-400 font-semibold mt-2">
                      ✓ ساخت استخر کارت به پایان رسید
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* بخش سوابق */}
            <div className="bg-[#1f2933] rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">سوابق استخرهای ساخته شده</h2>
              {poolHistory.length === 0 ? (
                <div className="text-gray-400 text-center py-4">
                  سابقه‌ای وجود ندارد
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {poolHistory.map((pool) => (
                    <div
                      key={pool.id}
                      className="bg-[#0E0E0F] rounded-xl p-4 border border-gray-700"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="text-sm text-gray-400 mb-1 flex items-center gap-2">
                            <span>Seed:</span>
                            <span className="font-mono text-xs">{formatSeed(pool.seed)}</span>
                            {pool.seed && (
                              <button
                                onClick={() => copyToClipboard(pool.seed!, pool.id)}
                                className="p-1 rounded hover:bg-gray-700 transition-colors"
                                title="کپی به کلیپ‌بورد"
                              >
                                {copiedSeed === pool.id ? (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-3.5 w-3.5 text-green-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-3.5 w-3.5 text-gray-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                  </svg>
                                )}
                              </button>
                            )}
                          </div>
                          <div className="text-sm text-gray-400">
                            تاریخ تولید: {formatDate(pool.createdAt)}
                          </div>
                          <div className="text-sm text-gray-400">
                            تعداد کارت: {pool.cardCount.toLocaleString("fa-IR")}
                          </div>
                        </div>
                        {pool.isActive && (
                          <span className="px-2 py-1 rounded-lg bg-green-600 text-white text-xs">
                            فعال
                          </span>
                        )}
                        {pool.isBuilding && (
                          <span className="px-2 py-1 rounded-lg bg-yellow-600 text-white text-xs">
                            در حال ساخت
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
