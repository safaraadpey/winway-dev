"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { listFeatures, createFeature } from "@/lib/featureFlags/adminClient";
import type { FeatureRow } from "@/src/types/feature-flags";

function getStatusLabel(feature: FeatureRow): string {
  if (!feature.is_enabled) {
    return "غیرفعال (Kill Switch)";
  }
  if (feature.default_enabled) {
    return "فعال برای همه";
  }
  if (feature.rollout_percentage > 0) {
    return `Rollout ${feature.rollout_percentage}%`;
  }
  if (feature.enabledOverrideCount > 0) {
    return "فعال برای کاربران انتخابی";
  }
  return "فعال (بدون دسترسی پیش‌فرض)";
}

export default function AdminFeaturesPage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/admin/dashboard"));

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setShowBackButton, setOnBackClick, setShowHeader]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listFeatures();
      setFeatures(result.features);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در بارگذاری Featureها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    if (!key.trim() || !name.trim()) {
      setError("کلید و نام Feature الزامی است.");
      return;
    }

    try {
      setCreating(true);
      setError(null);
      await createFeature({
        key: key.trim().toLowerCase(),
        name: name.trim(),
        description: description.trim() || null,
      });
      setKey("");
      setName("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ایجاد Feature");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] text-white p-4">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Feature Management</h1>
        <p className="text-sm text-gray-400">
          مدیریت Feature Flagها — فقط adminzero
        </p>

        <div className="rounded-xl bg-[#1f2933] p-4 space-y-3">
          <h2 className="text-base font-semibold">Feature جدید</h2>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="feature_key"
            className="w-full rounded-lg bg-[#111827] px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="نام Feature"
            className="w-full rounded-lg bg-[#111827] px-3 py-2 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="توضیحات (اختیاری)"
            className="w-full rounded-lg bg-[#111827] px-3 py-2 text-sm min-h-[72px]"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {creating ? "در حال ایجاد..." : "ایجاد Feature"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-900/40 border border-red-700 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-400">در حال بارگذاری...</div>
        ) : features.length === 0 ? (
          <div className="text-center py-8 text-gray-400">هنوز Featureی تعریف نشده است.</div>
        ) : (
          <div className="space-y-3">
            {features.map((feature) => (
              <button
                key={feature.id}
                type="button"
                onClick={() => router.push(`/admin/features/${feature.id}`)}
                className="w-full text-right rounded-xl bg-[#1f2933] px-4 py-3 hover:bg-[#273341] transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xl text-gray-400">›</span>
                  <div className="flex-1">
                    <div className="font-semibold">{feature.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{feature.key}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span
                    className={`rounded-full px-2 py-1 ${
                      feature.is_enabled ? "bg-emerald-900/60 text-emerald-300" : "bg-red-900/60 text-red-300"
                    }`}
                  >
                    {getStatusLabel(feature)}
                  </span>
                  <span className="text-gray-400">
                    کاربران دارای Override:{" "}
                    <span className="numeric-text numeric-text--14" dir="ltr">
                      {feature.enabledOverrideCount.toLocaleString("en-US")}
                    </span>
                    {" / "}
                    <span className="numeric-text numeric-text--14" dir="ltr">
                      {feature.assignedUserCount.toLocaleString("en-US")}
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
