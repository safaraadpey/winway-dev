"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadEntryBanner, updateEntryBanner, deleteEntryBanner } from "@/services/entry-banner";
import type { EntryBannerFormData, BannerContentType, BannerTargetAudience } from "@/src/types/entry-banner";
import toast from "react-hot-toast";

export default function EditEntryBannerPage() {
  const router = useRouter();
  const params = useParams();
  const bannerId = params.bannerId as string;
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [existingBanner, setExistingBanner] = useState<any>(null);

  const [formData, setFormData] = useState<EntryBannerFormData>({
    title: "",
    contentType: "text",
    textContent: "",
    imageFile: null,
    startDate: null,
    endDate: null,
    targetAudience: [],
    requireConfirmation: false,
    confirmationText: "",
    showTitle: true,
    showCloseButton: true,
    showDontShowAgain: true,
  });

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.back());

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick, router]);

  useEffect(() => {
    async function fetchBanner() {
      try {
        setLoading(true);
        const banner = await loadEntryBanner(bannerId);
        if (banner) {
          setExistingBanner(banner);
          setFormData({
            title: banner.title,
            contentType: banner.contentType,
            textContent: banner.textContent || "",
            imageFile: null,
            startDate: banner.startDate ? banner.startDate.split("T")[0] : null,
            endDate: banner.endDate ? banner.endDate.split("T")[0] : null,
            targetAudience: banner.targetAudience,
            requireConfirmation: banner.requireConfirmation,
            confirmationText: banner.confirmationText || "",
            showTitle: banner.showTitle !== false,
            showCloseButton: banner.showCloseButton !== false,
            showDontShowAgain: banner.showDontShowAgain !== false,
          });
        } else {
          toast.error("بنر یافت نشد");
          router.push("/admin/entry-banner");
        }
      } catch (error) {
        console.error("Error loading banner:", error);
        toast.error("خطا در بارگذاری بنر");
      } finally {
        setLoading(false);
      }
    }

    if (bannerId) {
      fetchBanner();
    }
  }, [bannerId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    // اعتبارسنجی
    if (!formData.title.trim()) {
      toast.error("لطفاً تیتر بنر را وارد کنید");
      return;
    }

    if (formData.contentType === "text" && !formData.textContent.trim()) {
      toast.error("لطفاً محتوای متن را وارد کنید");
      return;
    }

    if (formData.contentType === "image" && !formData.imageFile && !existingBanner?.imageUrl) {
      toast.error("لطفاً تصویر را انتخاب کنید");
      return;
    }

    if (formData.requireConfirmation && !formData.confirmationText.trim()) {
      toast.error("لطفاً متن تایید را وارد کنید");
      return;
    }

    try {
      setSaving(true);
      const result = await updateEntryBanner(bannerId, formData);

      if (result.success) {
        toast.success("بنر با موفقیت به‌روزرسانی شد");
        router.push("/admin/entry-banner");
      } else {
        toast.error(result.error || "خطا در به‌روزرسانی بنر");
      }
    } catch (error: any) {
      console.error("Error updating banner:", error);
      toast.error(error.message || "خطا در به‌روزرسانی بنر");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("آیا مطمئن هستید که می‌خواهید این بنر را حذف کنید؟")) {
      return;
    }

    try {
      setDeleting(true);
      const result = await deleteEntryBanner(bannerId);

      if (result.success) {
        toast.success("بنر با موفقیت حذف شد");
        router.push("/admin/entry-banner");
      } else {
        toast.error(result.error || "خطا در حذف بنر");
      }
    } catch (error: any) {
      console.error("Error deleting banner:", error);
      toast.error(error.message || "خطا در حذف بنر");
    } finally {
      setDeleting(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // بررسی سایز فایل
      if (file.size > 1024 * 1024) {
        toast.error("حجم فایل باید کمتر از 1 مگابایت باشد");
        return;
      }
      setFormData({ ...formData, imageFile: file });
    }
  };

  const toggleTargetAudience = (role: BannerTargetAudience) => {
    setFormData({
      ...formData,
      targetAudience: formData.targetAudience.includes(role)
        ? formData.targetAudience.filter((r) => r !== role)
        : [...formData.targetAudience, role],
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] text-white p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center py-8 text-gray-400">در حال بارگذاری...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0E0F] text-white p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-4">ویرایش بنر ورودی</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* تیتر بنر */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">تیتر بنر</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full rounded-xl bg-[#1f2933] text-white px-4 py-3 outline-none border border-transparent focus:border-teal-500"
              placeholder="عنوان بنر"
              required
            />
            <label className="block text-sm text-gray-400 mt-3 mb-2">نمایش تیتر در بنر</label>
            <select
              value={formData.showTitle ? "show" : "hide"}
              onChange={(e) =>
                setFormData({ ...formData, showTitle: e.target.value === "show" })
              }
              className="w-full rounded-xl bg-[#1f2933] text-white px-4 py-3 outline-none border border-transparent focus:border-teal-500"
            >
              <option value="show">نمایش</option>
              <option value="hide">عدم نمایش</option>
            </select>
            <label className="block text-sm text-gray-400 mt-3 mb-2">نمایش دکمه بستن</label>
            <select
              value={formData.showCloseButton ? "show" : "hide"}
              onChange={(e) =>
                setFormData({ ...formData, showCloseButton: e.target.value === "show" })
              }
              className="w-full rounded-xl bg-[#1f2933] text-white px-4 py-3 outline-none border border-transparent focus:border-teal-500"
            >
              <option value="show">نمایش</option>
              <option value="hide">عدم نمایش</option>
            </select>
            <label className="block text-sm text-gray-400 mt-3 mb-2">
              نمایش گزینه «دیگر این بنر را نمایش نده»
            </label>
            <select
              value={formData.showDontShowAgain ? "show" : "hide"}
              onChange={(e) =>
                setFormData({ ...formData, showDontShowAgain: e.target.value === "show" })
              }
              className="w-full rounded-xl bg-[#1f2933] text-white px-4 py-3 outline-none border border-transparent focus:border-teal-500"
            >
              <option value="show">نمایش</option>
              <option value="hide">عدم نمایش</option>
            </select>
          </div>

          {/* بازه تاریخ نمایش */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-2">تاریخ شروع</label>
              <input
                type="date"
                value={formData.startDate || ""}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value || null })}
                className="w-full rounded-xl bg-[#1f2933] text-white px-4 py-3 outline-none border border-transparent focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">تاریخ پایان</label>
              <input
                type="date"
                value={formData.endDate || ""}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value || null })}
                className="w-full rounded-xl bg-[#1f2933] text-white px-4 py-3 outline-none border border-transparent focus:border-teal-500"
              />
            </div>
          </div>

          {/* مخاطبان */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">مخاطبان</label>
            <div className="flex flex-wrap gap-2">
              {(["admin", "agent", "super", "player"] as BannerTargetAudience[]).map((role) => {
                const labels: Record<BannerTargetAudience, string> = {
                  admin: "ادمین",
                  agent: "ایجنت",
                  super: "سوپر",
                  player: "پلیر",
                };
                const isSelected = formData.targetAudience.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleTargetAudience(role)}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? "bg-teal-600 text-white"
                        : "bg-[#1f2933] text-gray-300 hover:bg-[#2a3441]"
                    }`}
                  >
                    {labels[role]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* نوع محتوا */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">نوع محتوا</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, contentType: "text" })}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  formData.contentType === "text"
                    ? "bg-teal-600 text-white"
                    : "bg-[#1f2933] text-gray-300"
                }`}
              >
                متن
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, contentType: "image" })}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  formData.contentType === "image"
                    ? "bg-teal-600 text-white"
                    : "bg-[#1f2933] text-gray-300"
                }`}
              >
                تصویر
              </button>
            </div>
          </div>

          {/* محتوای متن یا تصویر */}
          {formData.contentType === "text" ? (
            <div>
              <label className="block text-sm text-gray-400 mb-2">محتوای متن</label>
              <textarea
                value={formData.textContent}
                onChange={(e) => setFormData({ ...formData, textContent: e.target.value })}
                className="w-full rounded-xl bg-[#1f2933] text-white px-4 py-3 outline-none border border-transparent focus:border-teal-500 min-h-[120px]"
                placeholder="متن بنر را وارد کنید"
                required={formData.contentType === "text"}
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                تصویر (حداکثر 1 مگ، ابعاد 1000x1300 پیکسل)
              </label>
              {existingBanner?.imageUrl && !formData.imageFile && (
                <div className="mb-2">
                  <img
                    src={existingBanner.imageUrl}
                    alt="Current banner"
                    className="w-full rounded-lg mb-2"
                  />
                  <div className="text-sm text-gray-400">تصویر فعلی</div>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full rounded-xl bg-[#1f2933] text-white px-4 py-3 outline-none border border-transparent focus:border-teal-500"
              />
              {formData.imageFile && (
                <div className="mt-2 text-sm text-gray-400">
                  فایل جدید: {formData.imageFile.name} ({(formData.imageFile.size / 1024).toFixed(2)} KB)
                </div>
              )}
            </div>
          )}

          {/* نیاز به تایید */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.requireConfirmation}
                onChange={(e) => setFormData({ ...formData, requireConfirmation: e.target.checked })}
                className="w-5 h-5 rounded bg-[#1f2933] border-gray-600 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-300">نیاز به تایید کاربر برای بستن بنر</span>
            </label>
            {formData.requireConfirmation && (
              <input
                type="text"
                value={formData.confirmationText}
                onChange={(e) => setFormData({ ...formData, confirmationText: e.target.value })}
                className="w-full mt-2 rounded-xl bg-[#1f2933] text-white px-4 py-3 outline-none border border-transparent focus:border-teal-500"
                placeholder="متن تایید (مثلاً: قوانین را خواندم و می‌پذیرم)"
                required={formData.requireConfirmation}
              />
            )}
          </div>

          {/* دکمه پیش نمایش */}
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
          >
            {showPreview ? "مخفی کردن پیش نمایش" : "پیش نمایش"}
          </button>

          {/* پیش نمایش */}
          {showPreview && (
            <div className="relative rounded-xl bg-[#1f2933] border border-gray-700 overflow-hidden">
              {!formData.showCloseButton && (
                <div className="absolute top-3 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white">
                  <span className="text-lg leading-none">×</span>
                </div>
              )}
              {formData.showTitle && (
                <h3 className={`text-lg font-semibold px-4 pt-4 mb-2 ${!formData.showCloseButton ? "pl-12" : ""}`}>
                  {formData.title || "تیتر بنر"}
                </h3>
              )}
              {formData.contentType === "text" ? (
                <div className="text-gray-300 whitespace-pre-wrap p-4">
                  {formData.textContent || "محتوای متن..."}
                </div>
              ) : formData.imageFile ? (
                <div style={{ padding: 4 }}>
                  <img
                    src={URL.createObjectURL(formData.imageFile)}
                    alt="Preview"
                    className="w-full rounded-lg"
                  />
                </div>
              ) : existingBanner?.imageUrl ? (
                <div style={{ padding: 4 }}>
                  <img
                    src={existingBanner.imageUrl}
                    alt="Preview"
                    className="w-full rounded-lg"
                  />
                </div>
              ) : (
                <div className="text-gray-500 p-4">تصویری انتخاب نشده</div>
              )}
              {formData.requireConfirmation && (
                <div className="mt-2 px-4 pb-4 flex items-center gap-2">
                  <input type="checkbox" className="w-5 h-5" />
                  <span className="text-sm text-gray-300">
                    {formData.confirmationText || "متن تایید..."}
                  </span>
                </div>
              )}
              {!formData.requireConfirmation && formData.showDontShowAgain && (
                <div className="mt-2 px-4 pb-2 flex items-center gap-2">
                  <input type="checkbox" className="w-5 h-5" />
                  <span className="text-sm text-gray-300">دیگر این بنر را نمایش نده</span>
                </div>
              )}
              {formData.showCloseButton && (
                <div className="px-4 pb-4">
                  <div className="w-full h-12 rounded-xl bg-[#2a2a2a]/40 text-white text-lg font-bold flex items-center justify-center">
                    {formData.requireConfirmation ? "تایید و بستن" : "بستن"}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* دکمه‌های کنسل، حذف و تایید */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 py-3 rounded-xl bg-gray-600 text-white font-semibold hover:bg-gray-700 transition-colors"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting ? "..." : "حذف"}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {saving ? "..." : "ذخیره"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

