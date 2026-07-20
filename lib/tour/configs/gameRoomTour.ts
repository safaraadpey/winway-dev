import type { TourConfig } from "../types";

export const GAME_ROOM_TOUR_ID = "game-room";

export const gameRoomTour: TourConfig = {
  id: GAME_ROOM_TOUR_ID,
  version: 1,
  title: "راهنمای اتاق بازی",
  route: "/player/gameroom",
  steps: [
    {
      id: "wallet-before-buy",
      target: "player-balance",
      title: "موجودی شما",
      description: "قبل از خرید کارت، موجودی تومان خود را بررسی کنید.",
      placement: "bottom",
    },
    {
      id: "buy-cards",
      target: "game-room-buy-panel",
      title: "خرید کارت",
      description:
        "تعداد کارت را انتخاب کنید و با دکمه تایید، کارت‌های خود را برای این اتاق رزرو کنید.",
      placement: "bottom",
      optional: true,
    },
    {
      id: "waiting-status",
      target: "game-room-waiting-status",
      title: "وضعیت اتاق",
      description:
        "زمان باقی‌مانده تا شروع، حداقل بازیکن لازم و مجموع کارت‌های فعال در این بخش نمایش داده می‌شود.",
      placement: "top",
    },
    {
      id: "active-tables",
      target: "game-room-active-tables",
      title: "میزهای فعال",
      description:
        "میزهای در حال بازی یا آماده در همین اتاق را اینجا می‌بینید. برای ورود به میز دیگر، روی آن بزنید.",
      placement: "top",
      optional: true,
    },
  ],
};
