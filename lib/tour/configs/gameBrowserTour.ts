import type { TourConfig } from "../types";
import { enterGameRoomFromLobbyTourAction } from "../actions/enterGameRoomFromLobbyTour";

export const GAME_BROWSER_TOUR_ID = "game-browser";

export const gameBrowserTour: TourConfig = {
  id: GAME_BROWSER_TOUR_ID,
  version: 2,
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
    {
      id: "enter-game-room",
      target: "game-browser-first-room",
      title: "حالا وارد اتاق بازی شوید",
      description:
        "آماده‌اید؟ وارد همین اتاق شوید تا خرید کارت و وضعیت بازی را هم با هم مرور کنیم.",
      placement: "top",
      customAction: {
        label: "ورود به اتاق بازی",
        asPrimary: true,
        action: enterGameRoomFromLobbyTourAction,
      },
    },
  ],
};
