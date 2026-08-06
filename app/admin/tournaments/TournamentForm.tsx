"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type TournamentFormValues = {
  title: string;
  status: string;
  start_at: string | null;
  currency: string;
  entry_currency: string;
  ticket_price: number | null;
  min_tickets_per_player: number | null;
  max_tickets_per_player: number | null;
  table_size_mode: string;
  table_size_fixed: number | null;
  table_size_min: number | null;
  table_size_max: number | null;
  remainder_policy: string;
  commission_rate: number | null;
  guaranteed_prize: number | null;
  min_players_for_guarantee: number | null;
  min_players_to_start: number | null;
  /** Minutes to push start_at when under min_players_to_start (default 60). */
  registration_extend_minutes: number | null;
  final_winners_count: number | null;
};

export type TournamentFormProps = {
  mode: "create" | "edit";
  initialValues?: Partial<TournamentFormValues>;
  onSubmit: (values: TournamentFormValues) => Promise<void> | void;
  submitting?: boolean;
  readOnly?: boolean;
  lockedMessage?: string;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "پیش‌نویس" },
  { value: "registration_open", label: "ثبت‌نام باز" },
  { value: "running", label: "در حال اجرا" },
  { value: "settling", label: "در حال تسویه" },
  { value: "finished", label: "پایان‌یافته" },
  { value: "cancelled", label: "لغوشده" },
];

const TABLE_SIZE_MODE_OPTIONS = [
  { value: "fixed", label: "سایز ثابت" },
  { value: "range", label: "بازه‌ای" },
];

const REMAINDER_POLICY_OPTIONS = [
  { value: "adaptive_tables", label: "تقسیم تطبیقی میزها" },
  { value: "uniform_with_bye", label: "یکنواخت + بای" },
  { value: "uniform_with_ghost", label: "یکنواخت + گوست" },
];

const pad2 = (n: number) => n.toString().padStart(2, "0");

function toDateLocal(value?: Date): string {
  if (!value) return "";
  if (Number.isNaN(value.getTime())) return "";
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function toTimeLocal(value?: Date): string {
  if (!value) return "";
  if (Number.isNaN(value.getTime())) return "";
  return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
}

function buildTimeValue(hour: string, minute: string): string {
  if (!hour || !minute) return "";
  return `${pad2(Number(hour))}:${pad2(Number(minute))}`;
}

function toIsoFromLocal(dateValue: string, timeValue: string): string | null {
  if (!dateValue || !timeValue) return null;
  const local = new Date(`${dateValue}T${timeValue}`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

export function TournamentForm({
  mode,
  initialValues,
  onSubmit,
  submitting,
  readOnly = false,
  lockedMessage,
}: TournamentFormProps) {
  const defaults: TournamentFormValues = useMemo(
    () => ({
      title: "",
      status: "draft",
      start_at: null,
      currency: "IRR",
      entry_currency: "IRR",
      ticket_price: null,
      min_tickets_per_player: 1,
      max_tickets_per_player: 1,
      table_size_mode: "fixed",
      table_size_fixed: 10,
      table_size_min: 8,
      table_size_max: 12,
      remainder_policy: "adaptive_tables",
      commission_rate: null,
      guaranteed_prize: 0,
      min_players_for_guarantee: null,
      min_players_to_start: 3,
      registration_extend_minutes: 60,
      final_winners_count: 1,
    }),
    []
  );

  const [values, setValues] = useState<TournamentFormValues>({
    ...defaults,
    ...initialValues,
  });
  const [error, setError] = useState<string | null>(null);
  const startInputRef = useRef<HTMLInputElement | null>(null);
  const minDateLocal = useMemo(() => toDateLocal(new Date()), []);
  const [startDateLocal, setStartDateLocal] = useState("");
  const [startHour, setStartHour] = useState("");
  const [startMinute, setStartMinute] = useState("");
  const startTimeLocal = useMemo(
    () => buildTimeValue(startHour, startMinute),
    [startHour, startMinute]
  );
  const sanitizeTwoDigit = (raw: string, max: number) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (!digits) return "";
    const num = Math.min(max, Math.max(0, Number(digits)));
    return num.toString();
  };
  const updateStartAt = (nextDate: string, nextHour: string, nextMinute: string) => {
    const nextTime = buildTimeValue(nextHour, nextMinute);
    const startAtValue = toIsoFromLocal(nextDate, nextTime);
    handleChange("start_at", startAtValue);
  };

  useEffect(() => {
    setValues((prev) => ({ ...prev, ...initialValues }));
    if (initialValues?.start_at) {
      const parsed = new Date(initialValues.start_at);
      setStartDateLocal(toDateLocal(parsed));
      setStartHour(pad2(parsed.getHours()));
      setStartMinute(pad2(parsed.getMinutes()));
    } else {
      setStartDateLocal("");
      setStartHour("");
      setStartMinute("");
    }
  }, [initialValues]);

  const handleChange = (key: keyof TournamentFormValues, val: any) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleNumber = (key: keyof TournamentFormValues, val: string) => {
    const num = val === "" ? null : Number(val);
    handleChange(key, Number.isNaN(num) ? null : num);
  };
  const isFreeTournament = (values.ticket_price ?? 0) <= 0;

  useEffect(() => {
    if (isFreeTournament && values.min_players_for_guarantee != null) {
      setValues((prev) => ({ ...prev, min_players_for_guarantee: null }));
    }
  }, [isFreeTournament, values.min_players_for_guarantee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setError(null);
    if ((startDateLocal && !startTimeLocal) || (!startDateLocal && startTimeLocal)) {
      setError("تاریخ و ساعت شروع باید کامل باشند.");
      return;
    }
    const startAtValue = toIsoFromLocal(startDateLocal, startTimeLocal);
    if (!values.title.trim()) {
      setError("عنوان الزامی است.");
      return;
    }
    if (values.ticket_price != null && values.ticket_price < 0) {
      setError("قیمت بلیت نمی‌تواند منفی باشد. برای تورنومنت رایگان عدد ۰ وارد کنید.");
      return;
    }
    if (values.entry_currency === "DING" && (!values.guaranteed_prize || values.guaranteed_prize <= 0)) {
      setError("برای تورنومنت دینگی، مبلغ گارانتی الزامی است.");
      return;
    }
    if (
      values.min_tickets_per_player &&
      values.max_tickets_per_player &&
      values.min_tickets_per_player > values.max_tickets_per_player
    ) {
      setError("حداقل بلیت نمی‌تواند بیشتر از حداکثر باشد.");
      return;
    }
    if (values.table_size_mode === "fixed" && (!values.table_size_fixed || values.table_size_fixed <= 0)) {
      setError("سایز ثابت میز باید بیشتر از صفر باشد.");
      return;
    }
    if (
      values.table_size_mode === "range" &&
      values.table_size_min &&
      values.table_size_max &&
      values.table_size_min > values.table_size_max
    ) {
      setError("حداقل سایز میز نمی‌تواند بیشتر از حداکثر باشد.");
      return;
    }
    if (
      values.final_winners_count != null &&
      (values.final_winners_count < 1 || values.final_winners_count > 4)
    ) {
      setError("تعداد برنده‌های نهایی باید بین 1 تا 4 باشد.");
      return;
    }
    if (values.commission_rate != null && (values.commission_rate < 0 || values.commission_rate > 100)) {
      setError("کمیسیون باید بین 0 تا 100 باشد.");
      return;
    }
    if (
      values.min_players_for_guarantee != null &&
      values.min_players_for_guarantee < 1
    ) {
      setError("حداقل تعداد بازیکن گارانتی باید حداقل 1 باشد.");
      return;
    }
    if (
      values.min_players_to_start != null &&
      values.min_players_to_start < 3
    ) {
      setError("حداقل نفرات شروع تورنومنت باید حداقل 3 باشد.");
      return;
    }
    if (
      values.registration_extend_minutes != null &&
      (values.registration_extend_minutes < 1 ||
        values.registration_extend_minutes > 10080)
    ) {
      setError("تمدید زمان ثبت نام باید بین ۱ تا ۱۰۰۸۰ دقیقه باشد.");
      return;
    }
    if (startAtValue) {
      const now = new Date();
      const start = new Date(startAtValue);
      if (start.getTime() < now.getTime()) {
        setError("زمان شروع باید در آینده باشد.");
        return;
      }
    }
    await onSubmit({
      ...values,
      min_players_for_guarantee: isFreeTournament ? null : values.min_players_for_guarantee,
      start_at: startAtValue,
    });
  };

  const isRange = values.table_size_mode === "range";

  const inputClass =
    "rounded-lg bg-[#1f1f1f] border border-gray-700 px-3 py-2 text-white disabled:opacity-60 disabled:cursor-not-allowed";

  const statusLabel = (v: string) => {
    const found = STATUS_OPTIONS.find((opt) => opt.value === v);
    return found?.label ?? v;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="text-sm text-red-400">{error}</div>}
      {lockedMessage && (
        <div className="text-sm text-amber-400 bg-[#241a0a] border border-amber-700 rounded-lg px-3 py-2">
          {lockedMessage}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>عنوان</span>
          <input
            type="text"
            value={values.title}
            onChange={(e) => handleChange("title", e.target.value)}
            className={inputClass}
            required
            disabled={readOnly}
          />
        </label>

        {mode === "create" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span>وضعیت</span>
            <select
              value={values.status}
              onChange={(e) => handleChange("status", e.target.value)}
              className={inputClass}
              disabled={readOnly}
            >
              {STATUS_OPTIONS.filter((opt) => ["draft", "registration_open"].includes(opt.value)).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="flex flex-col gap-1 text-sm">
            <span>وضعیت</span>
            <div className="rounded-lg bg-[#1f1f1f] border border-gray-700 px-3 py-2 text-white">
              {statusLabel(values.status)}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1 text-sm">
          <span>زمان شروع</span>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              ref={startInputRef}
              value={startDateLocal}
              onChange={(e) => {
                const nextDate = e.target.value;
                setStartDateLocal(nextDate);
                if (!nextDate) {
                  setStartHour("");
                  setStartMinute("");
                  handleChange("start_at", null);
                  return;
                }
                updateStartAt(nextDate, startHour, startMinute);
              }}
              className={inputClass}
              min={minDateLocal}
              style={{ colorScheme: "dark" }}
              disabled={readOnly}
            />
            <div className={`${inputClass} flex items-center justify-center gap-2 px-2`}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="--"
                value={startHour}
                onChange={(e) => {
                  const nextHour = sanitizeTwoDigit(e.target.value, 23);
                  setStartHour(nextHour);
                  updateStartAt(startDateLocal, nextHour, startMinute);
                }}
                onBlur={() => {
                  if (!startHour) return;
                  const nextHour = pad2(Number(startHour));
                  setStartHour(nextHour);
                  updateStartAt(startDateLocal, nextHour, startMinute);
                }}
                className="w-10 bg-transparent text-center text-white placeholder:text-gray-500 outline-none focus:outline-none appearance-none [-moz-appearance:textfield]"
                disabled={readOnly}
              />
              <span className="text-gray-400">:</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="--"
                value={startMinute}
                onChange={(e) => {
                  const nextMinute = sanitizeTwoDigit(e.target.value, 59);
                  setStartMinute(nextMinute);
                  updateStartAt(startDateLocal, startHour, nextMinute);
                }}
                onBlur={() => {
                  if (!startMinute) return;
                  const nextMinute = pad2(Number(startMinute));
                  setStartMinute(nextMinute);
                  updateStartAt(startDateLocal, startHour, nextMinute);
                }}
                className="w-10 bg-transparent text-center text-white placeholder:text-gray-500 outline-none focus:outline-none appearance-none [-moz-appearance:textfield]"
                disabled={readOnly}
              />
            </div>
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span>ارز</span>
          <input
            type="text"
            value={values.currency}
            onChange={(e) => handleChange("currency", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>نوع پرداخت ورودی</span>
          <select
            value={values.entry_currency}
            onChange={(e) => handleChange("entry_currency", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          >
            <option value="IRR">تومان</option>
            <option value="DING">DING</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>قیمت بلیت (۰ = رایگان)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.ticket_price ?? ""}
            onChange={(e) => handleNumber("ticket_price", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>گارانتی</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.guaranteed_prize ?? ""}
            onChange={(e) => handleNumber("guaranteed_prize", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>
            حداقل بازیکن برای گارانتی
            {isFreeTournament ? " (در تورنومنت رایگان غیرفعال است)" : ""}
          </span>
          <input
            type="number"
            min="1"
            value={values.min_players_for_guarantee ?? ""}
            onChange={(e) => handleNumber("min_players_for_guarantee", e.target.value)}
            className={inputClass}
            disabled={readOnly || isFreeTournament}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>حداقل نفرات شروع تورنومنت (حداقل 3)</span>
          <input
            type="number"
            min="3"
            value={values.min_players_to_start ?? ""}
            onChange={(e) => handleNumber("min_players_to_start", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>تمدید زمان ثبت نام (دقیقه)</span>
          <input
            type="number"
            min="1"
            max="10080"
            value={values.registration_extend_minutes ?? ""}
            onChange={(e) =>
              handleNumber("registration_extend_minutes", e.target.value)
            }
            className={inputClass}
            disabled={readOnly}
          />
          <span className="text-xs text-gray-400">
            اگر به حد نصاب شروع نرسد، زمان شروع به همین مقدار عقب می‌افتد (پیش‌فرض
            ۶۰).
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>درصد کمیسیون (0 تا 100)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={values.commission_rate ?? ""}
            onChange={(e) => handleNumber("commission_rate", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>حداقل تعداد کارت پلیر</span>
          <input
            type="number"
            min="1"
            value={values.min_tickets_per_player ?? ""}
            onChange={(e) => handleNumber("min_tickets_per_player", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>حداکثر تعداد کارت پلیر</span>
          <input
            type="number"
            min="1"
            value={values.max_tickets_per_player ?? ""}
            onChange={(e) => handleNumber("max_tickets_per_player", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>مد سایز میز</span>
          <select
            value={values.table_size_mode}
            onChange={(e) => handleChange("table_size_mode", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          >
            {TABLE_SIZE_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {!isRange && (
          <label className="flex flex-col gap-1 text-sm">
            <span>سایز ثابت میز</span>
            <input
              type="number"
              min="1"
              value={values.table_size_fixed ?? ""}
              onChange={(e) => handleNumber("table_size_fixed", e.target.value)}
              className={inputClass}
              disabled={readOnly}
            />
          </label>
        )}

        {isRange && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span>حداقل سایز میز</span>
              <input
                type="number"
                min="1"
                value={values.table_size_min ?? ""}
                onChange={(e) => handleNumber("table_size_min", e.target.value)}
              className={inputClass}
              disabled={readOnly}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>حداکثر سایز میز</span>
              <input
                type="number"
                min="1"
                value={values.table_size_max ?? ""}
                onChange={(e) => handleNumber("table_size_max", e.target.value)}
              className={inputClass}
              disabled={readOnly}
              />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span>سیاست باقی‌مانده</span>
          <select
            value={values.remainder_policy}
            onChange={(e) => handleChange("remainder_policy", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          >
            {REMAINDER_POLICY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>تعداد برنده‌های نهایی (۱ تا ۴)</span>
          <input
            type="number"
            min="1"
            max="4"
            step="1"
            value={values.final_winners_count ?? ""}
            onChange={(e) => handleNumber("final_winners_count", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          />
        </label>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting || readOnly}
          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-sm font-semibold disabled:opacity-60"
        >
          {submitting ? "در حال ذخیره..." : mode === "create" ? "ایجاد تورنومنت" : "ذخیره تغییرات"}
        </button>
      </div>
    </form>
  );
}

