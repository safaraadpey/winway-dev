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
  later_round_table_size_mode: string;
  later_round_table_size_fixed: number | null;
  later_round_table_size_min: number | null;
  later_round_table_size_max: number | null;
  remainder_policy: string;
  commission_rate: number | null;
  guaranteed_prize: number | null;
  min_players_to_start: number | null;
  /** When false, under-min tournaments cancel at start_at instead of deferring. */
  registration_extend_enabled: boolean;
  /** Minutes to push start_at when under min_players_to_start (default 60). */
  registration_extend_minutes: number | null;
  final_winners_count: number | null;
  /** Prize share per rank (1..N); must sum to 100 when N > 1. */
  prize_percentages: number[];
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

const FINAL_WINNERS_OPTIONS = Array.from({ length: 8 }, (_, i) => i + 1);

const RANK_LABELS = [
  "نفر اول",
  "نفر دوم",
  "نفر سوم",
  "نفر چهارم",
  "نفر پنجم",
  "نفر ششم",
  "نفر هفتم",
  "نفر هشتم",
];

/** Equal split with remainder assigned to rank 1 (e.g. 3 → 34/33/33). */
export function buildEqualPrizePercents(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [100];
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

function rankLabel(rank: number): string {
  return RANK_LABELS[rank - 1] ?? `نفر ${rank}`;
}

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
      table_size_mode: "range",
      table_size_fixed: 10,
      table_size_min: 8,
      table_size_max: 10,
      later_round_table_size_mode: "range",
      later_round_table_size_fixed: 5,
      later_round_table_size_min: 4,
      later_round_table_size_max: 6,
      remainder_policy: "adaptive_tables",
      commission_rate: null,
      guaranteed_prize: 0,
      min_players_to_start: 3,
      registration_extend_enabled: true,
      registration_extend_minutes: 60,
      final_winners_count: 1,
      prize_percentages: [100],
    }),
    []
  );

  const mergedInitial = useMemo(() => {
    const count = initialValues?.final_winners_count ?? 1;
    const percents =
      initialValues?.prize_percentages && initialValues.prize_percentages.length === count
        ? initialValues.prize_percentages
        : buildEqualPrizePercents(count);
    return { ...defaults, ...initialValues, prize_percentages: percents };
  }, [defaults, initialValues]);

  const [values, setValues] = useState<TournamentFormValues>(mergedInitial);
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
    setValues(mergedInitial);
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
  }, [initialValues, mergedInitial]);

  const handleChange = (key: keyof TournamentFormValues, val: unknown) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleFinalWinnersCountChange = (raw: string) => {
    const count = Number(raw);
    if (Number.isNaN(count) || count < 1 || count > 8) return;
    setValues((prev) => ({
      ...prev,
      final_winners_count: count,
      prize_percentages: buildEqualPrizePercents(count),
    }));
  };

  const handlePrizePercentChange = (index: number, raw: string) => {
    const num = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(num)) return;
    setValues((prev) => {
      const next = [...prev.prize_percentages];
      next[index] = num;
      return { ...prev, prize_percentages: next };
    });
  };

  const prizePercentSum = useMemo(
    () => values.prize_percentages.reduce((sum, p) => sum + (Number(p) || 0), 0),
    [values.prize_percentages]
  );

  const handleNumber = (key: keyof TournamentFormValues, val: string) => {
    const num = val === "" ? null : Number(val);
    handleChange(key, Number.isNaN(num) ? null : num);
  };
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
      setError("سایز ثابت میز (راند اول) باید بیشتر از صفر باشد.");
      return;
    }
    if (
      values.table_size_mode === "range" &&
      values.table_size_min &&
      values.table_size_max &&
      values.table_size_min > values.table_size_max
    ) {
      setError("حداقل سایز میز (راند اول) نمی‌تواند بیشتر از حداکثر باشد.");
      return;
    }
    if (
      values.later_round_table_size_mode === "fixed" &&
      (!values.later_round_table_size_fixed || values.later_round_table_size_fixed <= 0)
    ) {
      setError("سایز ثابت میز (راند دوم به بعد) باید بیشتر از صفر باشد.");
      return;
    }
    if (
      values.later_round_table_size_mode === "range" &&
      values.later_round_table_size_min &&
      values.later_round_table_size_max &&
      values.later_round_table_size_min > values.later_round_table_size_max
    ) {
      setError("حداقل سایز میز (راند دوم به بعد) نمی‌تواند بیشتر از حداکثر باشد.");
      return;
    }
    const winnersCount = values.final_winners_count ?? 1;
    if (winnersCount < 1 || winnersCount > 8) {
      setError("تعداد برنده‌های نهایی باید بین 1 تا 8 باشد.");
      return;
    }
    if (values.prize_percentages.length !== winnersCount) {
      setError("تعداد درصدهای جایزه با تعداد برندگان هم‌خوان نیست.");
      return;
    }
    if (winnersCount > 1) {
      if (values.prize_percentages.some((p) => p <= 0)) {
        setError("هر درصد جایزه باید بیشتر از صفر باشد.");
        return;
      }
      if (prizePercentSum !== 100) {
        setError("جمع درصدهای جایزه باید دقیقاً 100 باشد.");
        return;
      }
    }
    if (values.commission_rate != null && (values.commission_rate < 0 || values.commission_rate > 100)) {
      setError("کمیسیون باید بین 0 تا 100 باشد.");
      return;
    }
    if (
      values.min_players_to_start == null ||
      values.min_players_to_start < 3
    ) {
      setError("حداقل نفرات شروع تورنومنت باید حداقل 3 باشد.");
      return;
    }
    if (values.registration_extend_enabled) {
      if (
        values.registration_extend_minutes == null ||
        values.registration_extend_minutes < 1 ||
        values.registration_extend_minutes > 10080
      ) {
        setError("تمدید زمان ثبت نام باید بین ۱ تا ۱۰۰۸۰ دقیقه باشد.");
        return;
      }
    }
    if (startAtValue) {
      const now = new Date();
      const start = new Date(startAtValue);
      if (start.getTime() < now.getTime()) {
        setError("زمان شروع باید در آینده باشد.");
        return;
      }
    }
    const prizePercentages =
      winnersCount === 1 ? [100] : values.prize_percentages.slice(0, winnersCount);

    await onSubmit({
      ...values,
      final_winners_count: winnersCount,
      prize_percentages: prizePercentages,
      min_players_to_start: values.min_players_to_start,
      registration_extend_enabled: values.registration_extend_enabled,
      registration_extend_minutes: values.registration_extend_minutes ?? 60,
      start_at: startAtValue,
    });
  };

  const isRange = values.table_size_mode === "range";
  const isLaterRange = values.later_round_table_size_mode === "range";

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

      <div className="grid md:grid-cols-2 gap-4 items-start">
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
          <span>حداقل نفرات شروع تورنومنت (حداقل 3)</span>
          <input
            type="number"
            min="3"
            value={values.min_players_to_start ?? ""}
            onChange={(e) => handleNumber("min_players_to_start", e.target.value)}
            className={inputClass}
            disabled={readOnly}
          />
          <span className="text-xs text-gray-400">
            اگر به این تعداد برسد تورنومنت شروع می‌شود؛ در صورت داشتن گارانتی،
            گارانتی هم از همان لحظه فعال است.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.registration_extend_enabled}
              onChange={(e) =>
                handleChange("registration_extend_enabled", e.target.checked)
              }
              className="h-4 w-4 accent-teal-500"
              disabled={readOnly}
            />
            تمدید خودکار در صورت نرسیدن به حد نصاب
          </span>
          <span className="text-xs text-gray-400">
            اگر خاموش باشد و حد نصاب نرسد، تورنومنت کنسل و ورودی‌ها بازگردانده
            می‌شوند.
          </span>
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
            disabled={readOnly || !values.registration_extend_enabled}
          />
          <span className="text-xs text-gray-400">
            فقط وقتی تمدید خودکار روشن است استفاده می‌شود (پیش‌فرض ۶۰). سقف تعداد
            تمدید وجود ندارد.
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

        <div className="md:col-span-2 rounded-lg border border-gray-700 bg-[#161616] p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-200">سایز میز — راند اول</div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>مد سایز میز (راند اول)</span>
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
                <span>سایز ثابت میز (راند اول)</span>
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
                  <span>حداقل سایز میز (راند اول)</span>
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
                  <span>حداکثر سایز میز (راند اول)</span>
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
          </div>
        </div>

        <div className="md:col-span-2 rounded-lg border border-gray-700 bg-[#161616] p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-200">سایز میز — راند دوم به بعد</div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>مد سایز میز (راند دوم به بعد)</span>
              <select
                value={values.later_round_table_size_mode}
                onChange={(e) => handleChange("later_round_table_size_mode", e.target.value)}
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

            {!isLaterRange && (
              <label className="flex flex-col gap-1 text-sm">
                <span>سایز ثابت میز (راند دوم به بعد)</span>
                <input
                  type="number"
                  min="1"
                  value={values.later_round_table_size_fixed ?? ""}
                  onChange={(e) => handleNumber("later_round_table_size_fixed", e.target.value)}
                  className={inputClass}
                  disabled={readOnly}
                />
              </label>
            )}

            {isLaterRange && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span>حداقل سایز میز (راند دوم به بعد)</span>
                  <input
                    type="number"
                    min="1"
                    value={values.later_round_table_size_min ?? ""}
                    onChange={(e) => handleNumber("later_round_table_size_min", e.target.value)}
                    className={inputClass}
                    disabled={readOnly}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>حداکثر سایز میز (راند دوم به بعد)</span>
                  <input
                    type="number"
                    min="1"
                    value={values.later_round_table_size_max ?? ""}
                    onChange={(e) => handleNumber("later_round_table_size_max", e.target.value)}
                    className={inputClass}
                    disabled={readOnly}
                  />
                </label>
              </>
            )}
          </div>
        </div>

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
          <span>تعداد برنده‌های نهایی</span>
          <select
            value={values.final_winners_count ?? 1}
            onChange={(e) => handleFinalWinnersCountChange(e.target.value)}
            className={inputClass}
            disabled={readOnly}
          >
            {FINAL_WINNERS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} نفر
              </option>
            ))}
          </select>
        </label>
      </div>

      {(values.final_winners_count ?? 1) > 1 && (
        <div className="rounded-lg border border-gray-700 bg-[#161616] p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-200">تخصیص درصد جایزه</div>
          <div className="grid md:grid-cols-2 gap-3">
            {values.prize_percentages.map((pct, index) => (
              <label key={index} className="flex flex-col gap-1 text-sm">
                <span>{rankLabel(index + 1)}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={pct || ""}
                    onChange={(e) => handlePrizePercentChange(index, e.target.value)}
                    className={inputClass}
                    disabled={readOnly}
                  />
                  <span className="numeric-text numeric-text--14 text-gray-400" dir="ltr">
                    %
                  </span>
                </div>
              </label>
            ))}
          </div>
          <div
            className={`text-sm ${
              prizePercentSum === 100 ? "text-teal-400" : "text-amber-400"
            }`}
          >
            جمع درصدها:{" "}
            <span className="numeric-text numeric-text--14" dir="ltr">
              {prizePercentSum.toLocaleString("en-US")}%
            </span>
            {prizePercentSum !== 100 && " (باید دقیقاً 100 باشد)"}
          </div>
        </div>
      )}

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

