import type { TourConfig } from "../types";
import { advanceTourStep } from "../actions/advanceTourStep";
import { enterGameLobbyFromMainTourAction } from "../actions/enterGameLobbyFromMainTour";

export const MAIN_PAGE_TOUR_ID = "main-page";

export const mainPageTour: TourConfig = {
  id: MAIN_PAGE_TOUR_ID,
  version: 3,
  title: "راهنمای صفحه اصلی",
  route: "/player/home",
  steps: [
    {
      id: "welcome",
      modal: true,
      title: "به DingMoney خوش آمدید",
      description:
        "در چند قدم کوتاه با بخش‌های اصلی برنامه آشنا می‌شوید تا راحت‌تر بازی کنید.",
      customAction: {
        label: "بزن بریم",
        asPrimary: true,
        action: advanceTourStep,
      },
    },
    {
      id: "player-balance",
      target: "player-balance",
      title: "موجودی شما",
      description:
        "این مبلغ، موجودی تومانی حساب شماست. مبلغی که شارژ می‌کنید و بردهای شما به این موجودی اضافه می‌شود.",
      placement: "bottom",
    },
    {
      id: "ding-balance",
      target: "ding-balance",
      title: "دینگ‌های شما",
      mediaSrc: "/tour/cards_ding_animated.gif",
      mediaAlt: "نمونه دریافت دینگ هنگام بازی",
      description:
        "دینگ هدیه‌ای است که هنگام بازی جمع می‌کنید. به ازای شماره‌هایی که در بازی برای شما می‌آید، دینگ دریافت می‌کنید. با دینگ‌ها می‌توانید در تورنومنت‌های دینگی آخر هفته شرکت کنید و شانس دوباره بگیرید.",
      placement: "bottom",
    },
    {
      id: "install-app",
      target: "install-app",
      title: "نصب اپلیکیشن",
      description:
        "برای دسترسی سریع‌تر و تجربه بهتر، DingMoney را روی دستگاه خود نصب کنید.",
      placement: "bottom",
      optional: true,
    },
    {
      id: "game-room",
      target: "game-room",
      title: "اتاق‌های بازی",
      description:
        "برای مشاهده اتاق‌ها و پیوستن به یک بازی، از این بخش وارد شوید.",
      placement: "top",
    },
    {
      id: "tournaments",
      target: "tournaments",
      title: "تورنومنت‌ها",
      description:
        "تورنومنت‌های فعال و آینده را اینجا ببینید و در آن‌ها شرکت کنید.",
      placement: "top",
    },
    {
      id: "leaderboard",
      target: "leaderboard",
      title: "بردها و رتبه‌ها",
      description:
        "رتبه، عملکرد و جایگاه خود را در میان بازیکنان از این بخش دنبال کنید.",
      placement: "top",
    },
    {
      id: "account-management",
      target: "account-management",
      title: "مدیریت حساب",
      description:
        "از این بخش‌ها می‌توانید پروفایل، تنظیمات و گزارش‌های مالی حساب خود را مدیریت کنید.",
      placement: "top",
    },
    {
      id: "support",
      target: "support",
      title: "پشتیبانی",
      description:
        "از این بخش می‌توانید با تیم پشتیبانی تماس بگیرید و سوالات و مشکلات خود را مطرح کنید.",
      placement: "top",
    },
    {
      id: "enter-game-room",
      target: "game-room",
      title: "حالا وارد اتاق بازی شوید",
      description:
        "آماده‌اید؟ وارد اتاق بازی شوید تا بخش‌های مختلف لابی را هم با هم مرور کنیم.",
      placement: "top",
      customAction: {
        label: "ورود به اتاق بازی",
        asPrimary: true,
        action: enterGameLobbyFromMainTourAction,
      },
    },
  ],
};
