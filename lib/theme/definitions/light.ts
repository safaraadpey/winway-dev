import type { ThemeDefinition } from "@/lib/theme/types";
import { themeHeaderFrameImage, themeDingBalanceBgImage, themeTomanBalanceBgImage } from "@/lib/theme/assetPaths";
import { themeActiveCardsPanelBgImage, themeBuyCardsPanelBgImage } from "@/lib/theme/gameRoomAssets";
import {
  IMAGE_MENU_PRESENTATIONS,
  SHARED_IMAGE_MENU_TOKENS,
} from "@/lib/theme/definitions/shared";

export const lightTheme: ThemeDefinition = {
  id: "light",
  title: "تم روشن",
  hint: "پس‌زمینه روشن‌تر برای محیط‌های پرنور",
  tokens: {
    player: {
      textPrimary: "#111827",
      textMuted: "#6b7280",
      pageOverlay: "#ffffff",
      surface: "rgba(255, 255, 255, 0.92)",
      surfaceElevated: "#ffffff",
      border: "rgba(209, 213, 219, 0.9)",
      accent: "#059669",
      accentMuted: "rgba(5, 150, 105, 0.1)",
      layoutBg: "#f3f4f6",
      layoutBgImage: "none",
      headerBg: "#ffffff",
      headerFrameImage: themeHeaderFrameImage("light"),
      headerFrameBlendMode: "normal",
      headerFrameFilter: "none",
      dingBalanceBgImage: themeDingBalanceBgImage("light"),
      tomanBalanceBgImage: themeTomanBalanceBgImage("light"),
      activeGameChipBgImage: "none",
      activeGameChipRadius: "12px",
      buyCardsPanelBgImage: themeBuyCardsPanelBgImage("light"),
      buyCardsPanelBgColor: "#ffffff",
      activeCardsPanelBgImage: themeActiveCardsPanelBgImage("light"),
      activeCardsPanelBgColor: "#ffffff",
    },
    menu: {
      ...SHARED_IMAGE_MENU_TOKENS,
      screenOverlay: "#ffffff",
    },
  },
  menuItems: IMAGE_MENU_PRESENTATIONS,
};
