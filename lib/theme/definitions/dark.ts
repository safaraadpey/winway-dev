import type { ThemeDefinition } from "@/lib/theme/types";
import {
  IMAGE_MENU_PRESENTATIONS,
  SHARED_IMAGE_MENU_TOKENS,
} from "@/lib/theme/definitions/shared";

export const darkTheme: ThemeDefinition = {
  id: "dark",
  title: "تم تیره",
  hint: "پس‌زمینه تیره و متن روشن (پیش‌فرض)",
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
      layoutBgImage: "url(/backgrounds/layout_BG.webp)",
    },
    menu: SHARED_IMAGE_MENU_TOKENS,
  },
  menuItems: IMAGE_MENU_PRESENTATIONS,
};
