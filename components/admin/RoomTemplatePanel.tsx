"use client";

import { useState, ChangeEvent, FormEvent, useEffect } from "react";
import type {
  RoomTemplatePayload,
  RoomTemplateStatus,
} from "@/src/types/room";
import toast from "react-hot-toast";

export type RoomTemplatePanelMode = "collapsed" | "edit" | "create";

interface RoomTemplatePanelProps {
  /** حالت اولیه نمایش: collapsed، edit یا create */
  mode: RoomTemplatePanelMode;
  /** مقدار اولیه فرم (می‌تواند ساختگی باشد) */
  initialTemplate: RoomTemplatePayload;
  /** عنوان نمایش در هدر کارت (مثلاً «اتاق ۵ تومنی» یا «ساخت اتاق جدید»). اگر نباشد از name استفاده می‌شود. */
  title?: string;
  /** Callback برای ذخیره‌سازی (create یا update) */
  onSave?: (template: RoomTemplatePayload) => Promise<void>;
  /** Callback برای حذف (اختیاری) */
  onDelete?: (templateId: string) => Promise<void>;
}

type FieldProps = {
  label: string;
  suffix?: string;
  children: React.ReactNode;
};

const DEFAULT_WAITING_TIMEOUT_SECONDS = 120;

function normalizeTemplateForForm(
  template: RoomTemplatePayload,
): RoomTemplatePayload {
  const waiting =
    template.waitingTimeoutSeconds != null &&
    template.waitingTimeoutSeconds >= 10
      ? template.waitingTimeoutSeconds
      : DEFAULT_WAITING_TIMEOUT_SECONDS;
  return {
    ...template,
    waitingTimeoutSeconds: waiting,
    roomType: "normal",
  };
}

function FieldRow({ label, suffix, children }: FieldProps) {
  return (
    <div className="flex items-center justify-between bg-neutral-800 text-neutral-100 rounded-md px-3 py-2 text-sm mb-2">
      <span className="whitespace-nowrap ml-3">{label}</span>
      <div className="flex items-center gap-2 w-1/2 justify-end">
        {children}
        {suffix && (
          <span className="text-xs text-neutral-400 whitespace-nowrap">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export default function RoomTemplatePanel({
  mode,
  initialTemplate,
  title,
  onSave,
  onDelete,
}: RoomTemplatePanelProps) {
  const [currentMode, setCurrentMode] = useState<RoomTemplatePanelMode>(mode);
  const [form, setForm] = useState<RoomTemplatePayload>(() =>
    normalizeTemplateForForm(initialTemplate),
  );
  // Track کردن inputهای در حال ویرایش (برای نمایش خالی به جای 0)
  const [focusedFields, setFocusedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCurrentMode(mode);
  }, [mode]);

  const isCollapsed = currentMode === "collapsed";
  const isCreate = currentMode === "create";

  const openEdit = () => {
    setForm(normalizeTemplateForForm(initialTemplate));
    setFocusedFields(new Set());
    setCurrentMode("edit");
  };

  const handleNumberFocus = (
    key:
      | "cardPrice"
      | "commissionPercent"
      | "minPlayers"
      | "maxPlayers"
      | "maxCardsPerPlayer"
      | "lineRewardPercent"
      | "fullRewardPercent"
      | "drawIntervalSec"
      | "countdownSec"
      | "waitingTimeoutSeconds"
      | "dingPerNumber",
  ) => () => {
    if (key === "maxPlayers") {
      if (form.maxPlayers == null || form.maxPlayers === 0) {
        setFocusedFields((prev) => new Set(prev).add(key));
      }
      return;
    }
    // اگر مقدار 0 است، آن را در state موقت خالی نگه دار
    if (form[key] === 0) {
      setFocusedFields((prev) => new Set(prev).add(key));
    }
  };

  const handleNumberBlur = (
    key:
      | "cardPrice"
      | "commissionPercent"
      | "minPlayers"
      | "maxPlayers"
      | "maxCardsPerPlayer"
      | "lineRewardPercent"
      | "fullRewardPercent"
      | "drawIntervalSec"
      | "countdownSec"
      | "waitingTimeoutSeconds"
      | "dingPerNumber",
  ) => () => {
    // وقتی focus از دست رفت، اگر مقدار خالی است به 0 تبدیل کن
    setFocusedFields((prev) => {
      const newSet = new Set(prev);
      newSet.delete(key);
      return newSet;
    });
    // اگر مقدار فعلی خالی یا undefined است، به 0 (یا پیش‌فرض مهلت لابی) تبدیل کن
    if (key === "maxPlayers") {
      if (
        form.maxPlayers === undefined ||
        form.maxPlayers === null ||
        form.maxPlayers === 0
      ) {
        setForm((prev) => ({ ...prev, maxPlayers: null }));
      }
      return;
    }
    if (
      form[key] === undefined ||
      form[key] === null ||
      (typeof form[key] === "number" && isNaN(form[key]))
    ) {
      setForm((prev) => ({
        ...prev,
        [key]:
          key === "waitingTimeoutSeconds"
            ? DEFAULT_WAITING_TIMEOUT_SECONDS
            : 0,
      }));
    }
  };

  const handleNumberChange = (
    key:
      | "cardPrice"
      | "commissionPercent"
      | "minPlayers"
      | "maxPlayers"
      | "maxCardsPerPlayer"
      | "lineRewardPercent"
      | "fullRewardPercent"
      | "drawIntervalSec"
      | "countdownSec"
      | "waitingTimeoutSeconds"
      | "dingPerNumber",
  ) => (e: ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // اگر خالی است، در state موقت نگه دار (برای نمایش خالی)
    if (inputValue === "" || inputValue === null) {
      setFocusedFields((prev) => new Set(prev).add(key));
      setForm((prev) => ({
        ...prev,
        [key]: key === "maxPlayers" ? null : 0,
      }));
      return;
    }
    // اگر مقدار معتبر است، state موقت را پاک کن و مقدار را به‌روزرسانی کن
    setFocusedFields((prev) => {
      const newSet = new Set(prev);
      newSet.delete(key);
      return newSet;
    });
    const value = Number(inputValue);
    setForm((prev) => ({ ...prev, [key]: isNaN(value) ? 0 : value }));
  };

  // Helper برای نمایش مقدار در input
  const getNumberDisplayValue = (
    key:
      | "cardPrice"
      | "commissionPercent"
      | "minPlayers"
      | "maxPlayers"
      | "maxCardsPerPlayer"
      | "lineRewardPercent"
      | "fullRewardPercent"
      | "drawIntervalSec"
      | "countdownSec"
      | "waitingTimeoutSeconds"
      | "dingPerNumber",
  ): string => {
    if (key === "waitingTimeoutSeconds") {
      const value =
        form.waitingTimeoutSeconds != null &&
        form.waitingTimeoutSeconds >= 10
          ? form.waitingTimeoutSeconds
          : DEFAULT_WAITING_TIMEOUT_SECONDS;
      if (focusedFields.has(key) && form.waitingTimeoutSeconds === 0) {
        return "";
      }
      return value.toString();
    }
    if (key === "maxPlayers") {
      if (
        form.maxPlayers == null ||
        (focusedFields.has(key) && form.maxPlayers === 0)
      ) {
        return "";
      }
      return form.maxPlayers.toString();
    }
    if (focusedFields.has(key) && form[key] === 0) {
      return "";
    }
    return form[key]?.toString() || "0";
  };

  const handleTextChange = (key: keyof RoomTemplatePayload) => (
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleStatusChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as RoomTemplateStatus;
    setForm((prev) => ({ ...prev, status: value }));
  };

  const handleCurrencyChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setForm((prev) => ({
      ...prev,
      currency: e.target.value as RoomTemplatePayload["currency"],
    }));
  };

  const handleBooleanChange = (key: "isVip" | "repeatable") => (
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    setForm((prev) => ({ ...prev, [key]: e.target.checked }));
  };

  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const getStatusLabel = (status: RoomTemplateStatus): string => {
    switch (status) {
      case "active":
        return "فعال";
      case "draining":
        return "در حال انتقال به آرشیو";
      case "inactive":
        return "غیرفعال";
      default:
        return status;
    }
  };

  const getStatusBadgeClass = (status: RoomTemplateStatus): string => {
    switch (status) {
      case "active":
        return "bg-emerald-600/80 text-emerald-50";
      case "draining":
        return "bg-amber-600/80 text-amber-50";
      case "inactive":
        return "bg-neutral-600/80 text-neutral-100";
      default:
        return "bg-neutral-600/80 text-neutral-100";
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!onSave) {
      console.warn("onSave callback not provided");
      return;
    }

    // اعتبارسنجی: مجموع جایزه خط و جایزه پر نباید بیشتر از 100 باشد
    const totalReward = form.lineRewardPercent + form.fullRewardPercent;
    if (totalReward > 100) {
      toast.error(
        `مجموع جایزه خط (${form.lineRewardPercent}%) و جایزه پر (${form.fullRewardPercent}%) نمی‌تواند بیشتر از 100% باشد. مجموع فعلی: ${totalReward}%`
      );
      return;
    }

    // اعتبارسنجی: فاصله بین قرعه‌ها باید در بازه مجاز باشد
    if (form.drawIntervalSec < 1 || form.drawIntervalSec > 300) {
      toast.error("فاصله بین قرعه‌ها باید بین ۱ تا ۳۰۰ ثانیه باشد.");
      return;
    }

    const waitingTimeoutSeconds =
      form.waitingTimeoutSeconds >= 10
        ? form.waitingTimeoutSeconds
        : DEFAULT_WAITING_TIMEOUT_SECONDS;

    if (waitingTimeoutSeconds < 10) {
      toast.error("تایم اوت-کمبود بازیکن باید حداقل ۱۰ ثانیه باشد.");
      return;
    }

    const maxPlayers =
      form.maxPlayers != null && form.maxPlayers > 0 ? form.maxPlayers : null;
    if (maxPlayers != null && maxPlayers < form.minPlayers) {
      toast.error(
        `حداکثر بازیکن (${maxPlayers}) نمی‌تواند کمتر از حداقل بازیکن (${form.minPlayers}) باشد.`,
      );
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        ...form,
        maxPlayers,
        waitingTimeoutSeconds,
        roomType: "normal",
      });
      // بعد از ذخیره موفق، اگر create بود به collapsed تبدیل می‌شود
      if (isCreate) {
        setCurrentMode("collapsed");
      }
    } catch (error) {
      console.error("Error saving template:", error);
      // خطا در toast نمایش داده می‌شود (در parent)
      throw error; // re-throw تا parent بتواند handle کند
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveClick = async () => {
    if (!onSave || !form.id || isCreate) return;

    const confirmed = window.confirm(
      "آیا از انتقال این اتاق به آرشیو مطمئن هستید؟\nاز این پس روم جدیدی از این تمپلیت ساخته نمی‌شود و پس از اتمام روم‌های فعلی، از دسترس خارج خواهد شد."
    );
    if (!confirmed) return;

    setIsArchiving(true);
    try {
      const archivedForm: RoomTemplatePayload = {
        ...form,
        status: "draining",
        roomType: "normal",
      };
      // بلافاصله state لوکال را هم به‌روزرسانی می‌کنیم تا badge درست شود
      setForm(archivedForm);
      await onSave(archivedForm);
      setCurrentMode("collapsed");
    } catch (error) {
      console.error("Error archiving template:", error);
      toast.error("خطا در انتقال به آرشیو");
    } finally {
      setIsArchiving(false);
    }
  };

  const handleRestoreClick = async () => {
    if (!onSave || !form.id || isCreate) return;

    const confirmed = window.confirm(
      "این تمپلیت از آرشیو خارج شده و دوباره فعال می‌شود.\nآیا مطمئن هستید؟"
    );
    if (!confirmed) return;

    setIsRestoring(true);
    try {
      const restoredForm: RoomTemplatePayload = {
        ...form,
        status: "active",
        roomType: "normal",
      };
      setForm(restoredForm);
      await onSave(restoredForm);
      setCurrentMode("collapsed");
    } catch (error) {
      console.error("Error restoring template:", error);
      toast.error("خطا در بازیابی از آرشیو");
    } finally {
      setIsRestoring(false);
    }
  };

  if (isCollapsed) {
    return (
      <div className="bg-neutral-900 text-neutral-100 rounded-xl px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm truncate">
            {title ?? (form.name || "Room template")}
          </span>
          {/* نمایش بج وضعیت فقط برای تمپلیت‌های ذخیره‌شده (نه ساخت اتاق جدید) */}
          {form.id && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${getStatusBadgeClass(
                form.status
              )}`}
            >
              {getStatusLabel(form.status)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={openEdit}
          className="text-xs px-3 py-1 rounded-md bg-teal-500 hover:bg-teal-400 text-black font-medium"
        >
          ویرایش
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-neutral-900 text-neutral-100 rounded-xl p-4 shadow-md w-full max-w-sm overflow-hidden relative"
      style={{ maxHeight: '100vh', overflowY: 'auto' }}
    >
      {/* هدر */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold truncate">
          {isCreate
            ? title ?? "ساخت اتاق جدید"
            : title ?? (form.name || "ویرایش اتاق")}
        </h2>
        <div className="flex gap-2">
          {!isCreate && form.id && (
            form.status === "active" ? (
              <button
                type="button"
                onClick={handleArchiveClick}
                disabled={isArchiving}
                className="text-xs px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-50"
              >
                {isArchiving ? "در حال انتقال..." : "انتقال به آرشیو"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRestoreClick}
                disabled={isRestoring}
                className="text-xs px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {isRestoring ? "در حال بازیابی..." : "بازیابی از آرشیو"}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setCurrentMode("collapsed")}
            className="text-xs px-2 py-1 rounded-md bg-neutral-700 hover:bg-neutral-600"
          >
            بستن
          </button>
        </div>
      </div>

      {/* فیلدها */}
      <div className="space-y-1" style={{ position: 'relative', overflow: 'visible' }}>
        <FieldRow label="وضعیت تمپلیت">
          <select
            className="w-32 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left"
            value={form.status}
            onChange={handleStatusChange}
          >
            <option value="active">فعال (ساخت روم جدید مجاز)</option>
            <option value="draining">در حال انتقال به آرشیو (فقط روم‌های فعلی)</option>
            <option value="inactive">غیرفعال کامل</option>
          </select>
        </FieldRow>

        <FieldRow label="نام اتاق">
          <input
            className="w-32 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left"
            value={form.name}
            onChange={handleTextChange("name")}
          />
        </FieldRow>

        <FieldRow label="قیمت کارت" suffix={form.currency === "IRR" ? "تومان" : form.currency}>
          <input
            type="number"
            className="w-24 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={getNumberDisplayValue("cardPrice")}
            onChange={handleNumberChange("cardPrice")}
            onFocus={handleNumberFocus("cardPrice")}
            onBlur={handleNumberBlur("cardPrice")}
          />
          <select
            className="w-18 bg-neutral-700 border border-neutral-600 rounded px-1 py-1 text-xs text-left"
            value={form.currency}
            onChange={handleCurrencyChange}
          >
            <option value="IRR">IRR</option>
            <option value="USD">USD</option>
          </select>
        </FieldRow>

        <FieldRow label="حداقل بازیکن" suffix="نفر">
          <input
            type="number"
            className="w-24 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={getNumberDisplayValue("minPlayers")}
            onChange={handleNumberChange("minPlayers")}
            onFocus={handleNumberFocus("minPlayers")}
            onBlur={handleNumberBlur("minPlayers")}
          />
        </FieldRow>

        <FieldRow label="حداکثر بازیکن" suffix="نفر">
          <input
            type="number"
            min={1}
            className="w-24 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={getNumberDisplayValue("maxPlayers")}
            onChange={handleNumberChange("maxPlayers")}
            onFocus={handleNumberFocus("maxPlayers")}
            onBlur={handleNumberBlur("maxPlayers")}
            title="خالی = بدون سقف؛ فقط تایمر و حداقل بازیکن برای شروع"
          />
        </FieldRow>

        <FieldRow label="حداکثر کارت بازیکن" suffix="برگ">
          <input
            type="number"
            className="w-24 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={getNumberDisplayValue("maxCardsPerPlayer")}
            onChange={handleNumberChange("maxCardsPerPlayer")}
            onFocus={handleNumberFocus("maxCardsPerPlayer")}
            onBlur={handleNumberBlur("maxCardsPerPlayer")}
          />
        </FieldRow>

        <FieldRow label="کمیسیون" suffix="درصد">
          <input
            type="number"
            className="w-24 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={getNumberDisplayValue("commissionPercent")}
            onChange={handleNumberChange("commissionPercent")}
            onFocus={handleNumberFocus("commissionPercent")}
            onBlur={handleNumberBlur("commissionPercent")}
          />
        </FieldRow>

        <FieldRow label="جایزه خط" suffix="درصد">
          <input
            type="number"
            className="w-24 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={getNumberDisplayValue("lineRewardPercent")}
            onChange={handleNumberChange("lineRewardPercent")}
            onFocus={handleNumberFocus("lineRewardPercent")}
            onBlur={handleNumberBlur("lineRewardPercent")}
          />
        </FieldRow>

        <FieldRow label="جایزه پر" suffix="درصد">
          <input
            type="number"
            className="w-24 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={getNumberDisplayValue("fullRewardPercent")}
            onChange={handleNumberChange("fullRewardPercent")}
            onFocus={handleNumberFocus("fullRewardPercent")}
            onBlur={handleNumberBlur("fullRewardPercent")}
          />
        </FieldRow>

        <FieldRow label="شمارش معکوس" suffix="ثانیه">
          <input
            type="number"
            className="w-24 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={getNumberDisplayValue("countdownSec")}
            onChange={handleNumberChange("countdownSec")}
            onFocus={handleNumberFocus("countdownSec")}
            onBlur={handleNumberBlur("countdownSec")}
          />
        </FieldRow>

        <FieldRow
          label="تایم اوت-کمبود بازیکن"
          suffix="ثانیه"
        >
          <input
            type="number"
            min={10}
            className="w-24 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={getNumberDisplayValue("waitingTimeoutSeconds")}
            onChange={handleNumberChange("waitingTimeoutSeconds")}
            onFocus={handleNumberFocus("waitingTimeoutSeconds")}
            onBlur={handleNumberBlur("waitingTimeoutSeconds")}
            title="حداکثر زمانی که روم waiting با کمتر از حداقل بازیکن می‌ماند؛ پس از آن janitor روم را کنسل می‌کند."
          />
        </FieldRow>

        <FieldRow
          label="فاصله بین قرعه ها"
          suffix="ثانیه"
        >
          <input
            type="number"
            min={1}
            max={300}
            className="w-24 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={getNumberDisplayValue("drawIntervalSec")}
            onChange={handleNumberChange("drawIntervalSec")}
            onFocus={handleNumberFocus("drawIntervalSec")}
            onBlur={handleNumberBlur("drawIntervalSec")}
            title="زمان بین قرعه‌های بینگو. باید بین ۱ تا ۳۰۰ ثانیه باشد."
          />
        </FieldRow>

        <FieldRow label="هر شماره چند دینگ" suffix="Ding">
          <input
            type="number"
            className="w-24 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={getNumberDisplayValue("dingPerNumber")}
            onChange={handleNumberChange("dingPerNumber")}
            onFocus={handleNumberFocus("dingPerNumber")}
            onBlur={handleNumberBlur("dingPerNumber")}
          />
        </FieldRow>

        <FieldRow label="VIP">
          <input
            type="checkbox"
            checked={form.isVip}
            onChange={handleBooleanChange("isVip")}
          />
        </FieldRow>

        <FieldRow label="پسورد">
          <input
            type="text"
            className="w-32 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-xs text-left"
            value={form.password ?? ""}
            onChange={handleTextChange("password")}
          />
        </FieldRow>
      </div>

      {/* دکمه ثبت */}
      <button
        type="submit"
        disabled={isSaving}
        className="mt-4 w-full bg-teal-500 hover:bg-teal-400 disabled:bg-teal-600 disabled:opacity-50 text-black font-semibold rounded-md py-2 text-sm"
      >
        {isSaving
          ? "در حال ذخیره..."
          : isCreate
          ? "ساخت اتاق جدید"
          : "ثبت تغییرات"}
      </button>
    </form>
  );
}


