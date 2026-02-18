"use client";

import { useState, useEffect } from "react";
import RoomTemplatePanel, {
  RoomTemplatePanelMode,
} from "@/components/admin/RoomTemplatePanel";
import {
  RoomTemplatePayload,
  createEmptyRoomTemplate,
} from "@/src/types/room";
import { loadRooms, saveRoomTemplate, deleteRoomTemplate } from "@/services/rooms";
import toast from "react-hot-toast";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useRouter } from "next/navigation";
import {
  getGlobalRegistrationLockState,
  setGlobalRegistrationLockState,
} from "@/lib/adminApiClient";

export default function RoomTemplatesPage() {
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const router = useRouter();

  // فعال کردن header و دکمه back
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
  const [templates, setTemplates] = useState<string[]>([]);
  const [templateData, setTemplateData] = useState<
    Map<string, RoomTemplatePayload>
  >(new Map());
  const [modes, setModes] = useState<Map<string, RoomTemplatePanelMode>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [newTemplate, setNewTemplate] = useState<RoomTemplatePayload>(() =>
    createEmptyRoomTemplate()
  );
  const [createKey, setCreateKey] = useState(0);
  const [globalRegistrationLocked, setGlobalRegistrationLocked] = useState(false);
  const [globalLockReason, setGlobalLockReason] = useState("");
  const [globalLockLoading, setGlobalLockLoading] = useState(true);
  const [globalLockSaving, setGlobalLockSaving] = useState(false);

  // بارگذاری روم‌ها از دیتابیس
  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadGlobalLockState() {
      try {
        setGlobalLockLoading(true);
        const state = await getGlobalRegistrationLockState();
        if (!isMounted) return;
        setGlobalRegistrationLocked(Boolean(state.global_registration_locked));
        setGlobalLockReason(state.global_registration_lock_reason || "");
      } catch (error: any) {
        if (!isMounted) return;
        setGlobalRegistrationLocked(false);
        setGlobalLockReason("");
        toast.error(error?.message || "خطا در بارگذاری وضعیت قفل ثبت نام");
      } finally {
        if (isMounted) setGlobalLockLoading(false);
      }
    }

    loadGlobalLockState();
    return () => {
      isMounted = false;
    };
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await loadRooms();
      const newMap = new Map<string, RoomTemplatePayload>();
      const newModes = new Map<string, RoomTemplatePanelMode>();

      data.forEach((template) => {
        if (template.id) {
          newMap.set(template.id, template);
          newModes.set(template.id, "collapsed");
        }
      });

      setTemplateData(newMap);
      setModes(newModes);
      setTemplates(
        data
          .map((t) => t.id || "")
          .filter((id): id is string => Boolean(id))
      );
    } catch (error) {
      console.error("Error loading templates:", error);
      toast.error("خطا در بارگذاری اتاق‌ها");
    } finally {
      setLoading(false);
    }
  };

  // ذخیره‌سازی (create یا update)
  const handleSave = async (template: RoomTemplatePayload) => {
    try {
      const saved = await saveRoomTemplate(template);

      // به‌روزرسانی state
      if (saved.id) {
        setTemplateData((prev) => {
          const newMap = new Map(prev);
          newMap.set(saved.id!, saved);
          return newMap;
        });

        // اگر create بود، به لیست اضافه می‌شود
        if (!templates.includes(saved.id)) {
          setTemplates((prev) => [...prev, saved.id!]);
          setModes((prev) => {
            const newModes = new Map(prev);
            newModes.set(saved.id!, "collapsed");
            return newModes;
          });
        } else {
          // اگر update بود، به collapsed تبدیل می‌شود
          setModes((prev) => {
            const newModes = new Map(prev);
            newModes.set(saved.id!, "collapsed");
            return newModes;
          });
        }
      }

      toast.success(
        template.id ? "اتاق با موفقیت به‌روزرسانی شد" : "اتاق جدید با موفقیت ایجاد شد"
      );
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast.error(error.message || "خطا در ذخیره‌سازی اتاق");
      throw error;
    }
  };

  // تغییر حالت پنل (collapsed <-> edit)
  const handleModeChange = (templateId: string, newMode: RoomTemplatePanelMode) => {
    setModes((prev) => {
      const newModes = new Map(prev);
      newModes.set(templateId, newMode);
      return newModes;
    });
  };

  // ذخیره‌سازی برای create جدید
  const handleCreateSave = async (template: RoomTemplatePayload) => {
    await handleSave(template);
    // بعد از create موفق، فرم را reset می‌کنیم
    setNewTemplate(createEmptyRoomTemplate());
    setCreateKey((prev) => prev + 1); // تغییر key برای remount کامپوننت
  };

  // حذف template موجود
  const handleDelete = async (templateId: string) => {
    try {
      await deleteRoomTemplate(templateId);

      setTemplateData((prev) => {
        const newMap = new Map(prev);
        newMap.delete(templateId);
        return newMap;
      });

      setModes((prev) => {
        const newModes = new Map(prev);
        newModes.delete(templateId);
        return newModes;
      });

      setTemplates((prev) => prev.filter((id) => id !== templateId));

      toast.success("اتاق با موفقیت حذف شد");
    } catch (error: any) {
      console.error("Error deleting template:", error);
      toast.error(error.message || "خطا در حذف اتاق");
      throw error;
    }
  };

  const handleToggleGlobalLock = async () => {
    try {
      setGlobalLockSaving(true);
      const nextLocked = !globalRegistrationLocked;
      const state = await setGlobalRegistrationLockState(
        nextLocked,
        nextLocked ? globalLockReason : ""
      );
      setGlobalRegistrationLocked(Boolean(state.global_registration_locked));
      setGlobalLockReason(state.global_registration_lock_reason || "");
      toast.success(
        nextLocked
          ? "قفل سراسری ثبت نام فعال شد"
          : "قفل سراسری ثبت نام غیرفعال شد"
      );
    } catch (error: any) {
      toast.error(error?.message || "خطا در تغییر وضعیت قفل ثبت نام");
    } finally {
      setGlobalLockSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className="p-6"
        style={{
          backgroundColor: "#0E0E0F",
          minHeight: "100vh",
        }}
      >
        <h1 className="text-lg font-bold mb-4 text-neutral-100">
          تنظیمات اتاق‌ها
        </h1>
        <div className="text-neutral-400 text-center py-8">در حال بارگذاری...</div>
      </div>
    );
  }

  return (
    <div
      className="p-6"
      style={{
        overflowX: "hidden",
        position: "relative",
        maxWidth: "100vw",
        backgroundColor: "#0E0E0F",
        minHeight: "100vh",
      }}
    >
      <h1 className="text-lg font-bold mb-4 text-neutral-100">
        تنظیمات اتاق‌ها
      </h1>
      <div className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">قفل سراسری ثبت نام بازی</div>
            <div
              className={`text-xs mt-1 ${
                globalRegistrationLocked ? "text-amber-300" : "text-emerald-300"
              }`}
            >
              {globalLockLoading
                ? "در حال بارگذاری وضعیت..."
                : globalRegistrationLocked
                  ? "ثبت نام همه بازی‌ها قفل است"
                  : "ثبت نام همه بازی‌ها باز است"}
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleGlobalLock}
            disabled={globalLockLoading || globalLockSaving}
            className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
              globalRegistrationLocked
                ? "bg-emerald-600 text-white"
                : "bg-amber-600 text-white"
            }`}
          >
            {globalLockSaving
              ? "در حال ذخیره..."
              : globalRegistrationLocked
                ? "باز کردن ثبت نام"
                : "قفل کردن ثبت نام"}
          </button>
        </div>
        <div className="mt-2">
          <input
            type="text"
            value={globalLockReason}
            onChange={(e) => setGlobalLockReason(e.target.value)}
            placeholder="علت قفل (اختیاری)"
            maxLength={500}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
          />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {/* نمایش روم‌های موجود */}
        {templates.map((templateId) => {
          const template = templateData.get(templateId);
          const mode = modes.get(templateId) || "collapsed";

          if (!template) return null;

          return (
            <RoomTemplatePanel
              key={templateId}
              mode={mode}
              initialTemplate={template}
              title={template.name || "بدون نام"}
              onSave={async (saved) => {
                await handleSave(saved);
                // بعد از save موفق، mode را به collapsed تبدیل می‌کنیم
                handleModeChange(templateId, "collapsed");
              }}
              onDelete={async (id) => {
                await handleDelete(id);
              }}
            />
          );
        })}

        {/* کامپوننت ایجاد روم جدید */}
        <RoomTemplatePanel
          key={`create-${createKey}`}
          mode="create"
          initialTemplate={newTemplate}
          title="ساخت اتاق جدید"
          onSave={handleCreateSave}
        />
      </div>
    </div>
  );
}

