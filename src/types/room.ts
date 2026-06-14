// src/types/room.ts
//
// Frontend-facing types and mappers for `public.room_templates`.
// This is aligned with the current Postgres schema:
//   id uuid
//   name text
//   price numeric
//   currency text
//   min_players int
//   countdown_sec int
//   line_reward_percentage numeric
//   full_reward_percentage numeric
//   vip boolean
//   password text
//   repeatable boolean
//   scheduled_start_time time
//   ding_per_number numeric
//   room_type room_type (normal | tournament)
//   commission_rate numeric
//   max_cards_per_player int
//   status room_template_status (active | draining | inactive)

export type RoomType = "normal" | "tournament";

export type RoomCurrency = "IRR" | "USD";

export type RoomTemplateStatus = "active" | "draining" | "inactive";

/**
 * Payload that UI فرم تنظیمات Room Template با آن کار می‌کند.
 * این ساختار برای ارسال/دریافت به API استفاده می‌شود، نه لزوماً
 * یک‌به‌یک همان نام ستون‌های دیتابیس.
 */
export type RoomTemplatePayload = {
  /** UUID template – در create می‌تواند خالی باشد، در update لازم است */
  id?: string;

  /** نام نمایشی اتاق (room_templates.name) */
  name: string;

  /** قیمت هر کارت (room_templates.price) */
  cardPrice: number;

  /** ارز قیمت کارت (room_templates.currency) */
  currency: RoomCurrency;

  /** حداقل بازیکن برای شروع (room_templates.min_players) */
  minPlayers: number;

  /** حداکثر کارت مجاز برای هر بازیکن (room_templates.max_cards_per_player) */
  maxCardsPerPlayer: number;

  /** درصد کمیسیون کل روی بلیت (room_templates.commission_rate) */
  commissionPercent: number;

  /** درصد جایزه خط (room_templates.line_reward_percentage) */
  lineRewardPercent: number;

  /** درصد جایزه پر (room_templates.full_reward_percentage) */
  fullRewardPercent: number;

  /** نوع روم: normal یا tournament (room_templates.room_type) */
  roomType: RoomType;

  /** وضعیت تمپلیت: active | draining | inactive (room_templates.status) */
  status: RoomTemplateStatus;

  /** آیا این روم VIP است؟ (room_templates.vip) */
  isVip: boolean;

  /** شمارش معکوس لابی بر حسب ثانیه (room_templates.countdown_sec) */
  countdownSec: number;

  /** فاصله بین قرعه‌ها بر حسب ثانیه (room_templates.draw_interval_sec) */
  drawIntervalSec: number;

  /** هر شماره چند Ding بدهد (room_templates.ding_per_number) */
  dingPerNumber: number;

  /** پسورد ورود به روم (room_templates.password) – اگر null/"" باشد بدون پسورد است */
  password?: string | null;

  /** آیا روم بعد از عدم تکمیل / پایان دوباره ساخته شود؟ (room_templates.repeatable) */
  repeatable: boolean;

  /**
   * تاریخ شروع تورنمنت به صورت YYYY-MM-DD (room_templates.scheduled_start_time).
   * برای روم‌های normal معمولاً null است.
   */
  tournamentDate?: string | null;

  /**
   * ساعت شروع تورنمنت به صورت HH:mm (room_templates.scheduled_start_time).
   * برای روم‌های normal معمولاً null است.
   */
  tournamentTime?: string | null;
};

// شکل خام ردیفی که از Supabase برای room_templates می‌گیریم
export type RoomTemplateDbRow = {
  id: string;
  name: string;
  price: number | null;
  currency: string | null;
  min_players: number | null;
  countdown_sec: number | null;
  draw_interval_sec: number | null;
  line_reward_percentage: number | null;
  full_reward_percentage: number | null;
  vip: boolean | null;
  password: string | null;
  repeatable: boolean | null;
  scheduled_start_time: string | null; // ISO 8601 timestamptz e.g. "2025-11-22T14:30:00+00:00"
  ding_per_number: number | null;
  room_type: RoomType | null;
  commission_rate: number | null;
  max_cards_per_player: number | null;
  status: RoomTemplateStatus | null;
};

/**
 * Helper: نگاشت ردیف خام دیتابیس به Payload فرانت.
 */
export function mapRoomTemplateFromDb(row: RoomTemplateDbRow): RoomTemplatePayload {
  return {
    id: row.id,
    name: row.name ?? "",
    cardPrice: Number(row.price ?? 0),
    currency: (row.currency as RoomCurrency) ?? "IRR",
    minPlayers: row.min_players ?? 1,
    maxCardsPerPlayer: row.max_cards_per_player ?? 999999,
    commissionPercent: Number(row.commission_rate ?? 0),
    // تبدیل از decimal (0-1) به درصد (0-100)
    lineRewardPercent: Number((row.line_reward_percentage ?? 0.5) * 100),
    fullRewardPercent: Number((row.full_reward_percentage ?? 0.8) * 100),
    roomType: row.room_type ?? "normal",
    status: row.status ?? "active",
    isVip: Boolean(row.vip),
    countdownSec: row.countdown_sec ?? 120,
    drawIntervalSec: row.draw_interval_sec ?? 3,
    dingPerNumber: Number(row.ding_per_number ?? 1),
    password: row.password,
    repeatable: Boolean(row.repeatable),
    tournamentDate: row.scheduled_start_time
      ? extractDateFromTimestamptz(row.scheduled_start_time)
      : null,
    tournamentTime: row.scheduled_start_time
      ? extractTimeFromTimestamptz(row.scheduled_start_time)
      : null,
  };
}

/**
 * Helper: نگاشت Payload فرانت به آبجکت مناسب برای upsert روی `room_templates`.
 * - id را شامل نمی‌کنیم تا خودت در فراخوانی Supabase تصمیم بگیری.
 */
export function mapRoomTemplateToDbUpdate(
  payload: RoomTemplatePayload
): Omit<RoomTemplateDbRow, "id"> {
  return {
    name: payload.name,
    price: payload.cardPrice,
    currency: payload.currency,
    min_players: payload.minPlayers,
    countdown_sec: payload.countdownSec,
    draw_interval_sec: payload.drawIntervalSec,
    // تبدیل از درصد (0-100) به decimal (0-1)
    line_reward_percentage: payload.lineRewardPercent / 100,
    full_reward_percentage: payload.fullRewardPercent / 100,
    vip: payload.isVip,
    password: payload.password ?? null,
    repeatable: payload.repeatable,
    scheduled_start_time:
      payload.tournamentDate && payload.tournamentTime
        ? combineDateAndTimeToTimestamptz(
            payload.tournamentDate,
            payload.tournamentTime
          )
        : null,
    ding_per_number: payload.dingPerNumber,
    room_type: payload.roomType,
    commission_rate: payload.commissionPercent,
    max_cards_per_player: payload.maxCardsPerPlayer,
    status: payload.status,
  };
}

/**
 * ساخت یک RoomTemplatePayload خالی با مقادیر پیش‌فرض.
 * برای استفاده در فرم ایجاد/ویرایش تمپلیت در فرانت.
 */
export function createEmptyRoomTemplate(): RoomTemplatePayload {
  return {
    id: undefined,
    name: "",
    cardPrice: 0,
    currency: "IRR",
    minPlayers: 1,
    maxCardsPerPlayer: 1,
    commissionPercent: 0,
    lineRewardPercent: 0,
    fullRewardPercent: 0,
    roomType: "normal",
    status: "active",
    isVip: false,
    countdownSec: 60,
    drawIntervalSec: 3,
    dingPerNumber: 1,
    password: null,
    repeatable: false,
    tournamentDate: null,
    tournamentTime: null,
  };
}

/**
 * استخراج تاریخ از timestamptz برای input type="date"
 * ورودی: "2025-11-22T14:30:00+00:00" یا "2025-11-22T14:30:00Z"
 * خروجی: "2025-11-22"
 */
export function extractDateFromTimestamptz(timestamptz: string): string {
  if (!timestamptz) return "";
  try {
    const date = new Date(timestamptz);
    if (isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

/**
 * استخراج ساعت از timestamptz برای input type="time"
 * ورودی: "2025-11-22T14:30:00+00:00" یا "2025-11-22T14:30:00Z"
 * خروجی: "14:30"
 */
export function extractTimeFromTimestamptz(timestamptz: string): string {
  if (!timestamptz) return "";
  try {
    const date = new Date(timestamptz);
    if (isNaN(date.getTime())) return "";
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  } catch {
    return "";
  }
}

/**
 * ترکیب تاریخ و ساعت به timestamptz برای دیتابیس
 * ورودی: date="2025-11-22", time="14:30"
 * خروجی: "2025-11-22T14:30:00+00:00" (ISO 8601)
 */
export function combineDateAndTimeToTimestamptz(
  date: string,
  time: string
): string {
  if (!date || !time) return "";
  try {
    // ترکیب date و time: "2025-11-22T14:30"
    const datetimeLocal = `${date}T${time}`;
    const dateObj = new Date(datetimeLocal);
    if (isNaN(dateObj.getTime())) return "";
    // برگرداندن به صورت ISO string (با timezone)
    return dateObj.toISOString();
  } catch {
    return "";
  }
}



