import type { TourConfig } from "../types";

export const GAME_BROWSER_TOUR_ID = "game-browser";

export const gameBrowserTour: TourConfig = {
  id: GAME_BROWSER_TOUR_ID,
  version: 1,
  title: "راهنمای مرورگر بازی",
  route: "/player/lobby",
  steps: [
    {
      id: "wallet-summary",
      target: "game-browser-wallet",
      title: "موجودی شما",
      description:
        "پیش از ورود به اتاق، موجودی تومان و دینگ خود را در این قسمت بررسی یا به‌روزرسانی کنید.",
      placement: "bottom",
    },
    {
      id: "room-list",
      target: "game-browser-first-room",
      title: "اتاق‌های در دسترس",
      description:
        "اتاق‌های فعال بر اساس مبلغ ورودی نمایش داده می‌شوند. برای دیدن گزینه‌های بیشتر صفحه را پیمایش کنید.",
      placement: "top",
    },
    {
      id: "room-stats",
      target: "game-browser-first-room-stats",
      title: "وضعیت اتاق",
      description:
        "این نشان‌ها تعداد بازیکنان و میزهای در حال بازی را نمایش می‌دهند. برای ورود، روی خود کارت اتاق بزنید.",
      placement: "bottom",
    },
  ],
};
