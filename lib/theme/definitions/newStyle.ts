import type { ThemeDefinition } from "@/lib/theme/types";
import { themeLayoutBgImage, themeHeaderFrameImage, themeDingBalanceBgImage, themeTomanBalanceBgImage } from "@/lib/theme/assetPaths";
import { themeActiveCardsPanelBgImage, themeBuyCardsPanelBgImage } from "@/lib/theme/gameRoomAssets";
import {
  IMAGE_MENU_PRESENTATIONS,
  SHARED_IMAGE_MENU_TOKENS,
} from "@/lib/theme/definitions/shared";

export const newStyleTheme: ThemeDefinition = {
  id: "newStyle",
  title: "استایل نو",
  hint: "نسخه جدید بر پایه تم تیره (قابل شخصی‌سازی)",
  tokens: {
    player: {
      textPrimary: "#ffffff",
      textMuted: "#9ca3af",
      pageOverlay: "rgba(14, 14, 15, 0.55)",
      surface: "rgba(26, 26, 26, 0.75)",
      surfaceElevated: "#2d2d2d",
      border: "rgba(64, 64, 64, 0.5)",
      accent: "#00d4aa",
      accentMuted: "rgba(0, 212, 170, 0.12)",
      layoutBg: "#0e0e0f",
      layoutBgImage: themeLayoutBgImage("newStyle"),
      headerBg: "rgba(14, 14, 15, 0.55)",
      headerFrameImage: themeHeaderFrameImage("newStyle"),
      headerFrameBlendMode: "lighten",
      headerFrameFilter: "none",
      dingBalanceBgImage: themeDingBalanceBgImage("newStyle"),
      tomanBalanceBgImage: themeTomanBalanceBgImage("newStyle"),
      dingBalanceAmountColor: "#fff8e5",
      tomanBalanceAmountColor: "#c4c8d0",
      activeGameChipBgImage: "none",
      activeGameChipRadius: "12px",
      buyCardsPanelBgImage: themeBuyCardsPanelBgImage("newStyle"),
      buyCardsPanelBgColor: "#151A26",
      activeCardsPanelBgImage: themeActiveCardsPanelBgImage("newStyle"),
      activeCardsPanelBgColor: "#161A26",
    },
    menu: SHARED_IMAGE_MENU_TOKENS,
  },
  menuItems: IMAGE_MENU_PRESENTATIONS,
};
