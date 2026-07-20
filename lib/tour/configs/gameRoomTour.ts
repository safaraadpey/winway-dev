import type { TourConfig } from "../types";
import { advanceTourStep } from "../actions/advanceTourStep";

export const GAME_ROOM_TOUR_ID = "game-room";

export const gameRoomTour: TourConfig = {
  id: GAME_ROOM_TOUR_ID,
  version: 3,
  title: "راهنمای اتاق بازی",
  route: "/player/gameroom",
  steps: [
    {
      id: "buy-cards",
      target: "game-room-buy-panel",
      title: "خرید کارت",
      description:
        "با دکمه‌های مثبت و منفی تعداد کارت‌های خود را کم و زیاد کنید، سپس با دکمه تایید، کارت‌ها را برای این اتاق رزرو کنید.",
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
    {
      id: "onboarding-complete",
      modal: true,
      showBrandLogo: true,
      title: "🎉 به DingMoney خوش اومدی!",
      description:
        "حالا دیگه همه‌چی آماده‌ست!\nمیزت رو پیدا کن، وارد بازی شو، دینگ جمع کن و از رقابت لذت ببر.\n\nموفق باشی و پر از برد! 🏆",
      customAction: {
        label: "بزن بریم! 🚀",
        asPrimary: true,
        action: advanceTourStep,
      },
    },
  ],
};
