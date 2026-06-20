import type { MenuItemId, MenuItemPresentation, MenuTokens } from "@/lib/theme/types";

/** Menu item tokens shared by dark/light today (image-based banners, no item chrome). */
export const SHARED_IMAGE_MENU_TOKENS: MenuTokens = {
  screenOverlay: "rgba(14, 14, 15, 0.55)",
  itemBackground: "transparent",
  itemBackgroundImage: "none",
  itemBackgroundGradient: "none",
  itemBorder: "none",
  itemOverlay: "transparent",
  itemText: "#ffffff",
  itemRadius: "12px",
};

/** Image presentations used by dark and light themes (current production menus). */
export const IMAGE_MENU_PRESENTATIONS: Record<MenuItemId, MenuItemPresentation> = {
  gameRoom: { kind: "image", imageKey: "gameRoom", alt: "Game Room" },
  tournaments: { kind: "image", imageKey: "tournaments", alt: "Tournaments" },
  leaderboard: { kind: "image", imageKey: "leaderboard", alt: "Leaderboard" },
  myProfile: { kind: "image", imageKey: "myProfile", alt: "My Profile" },
  settings: { kind: "image", imageKey: "settings", alt: "Settings" },
  reports: { kind: "image", imageKey: "reports", alt: "Financial Reports" },
  logout: { kind: "image", imageKey: "logout", alt: "Logout" },
  support: { kind: "image", imageKey: "support", alt: "Support" },
};

/*
 * Future theme examples (not registered):
 *
 * Color + border menu item tokens:
 *   itemBackground: "#1a1a2e"
 *   itemBorder: "1px solid rgba(0, 212, 170, 0.35)"
 *   presentation: { kind: "styled", titleFa: "تنظیمات", titleEn: "SETTINGS" }
 *
 * Gradient menu item tokens:
 *   itemBackgroundGradient: "linear-gradient(135deg, #25194c 0%, #120d25 100%)"
 *   itemBorder: "1px solid rgba(116, 128, 255, 0.65)"
 *
 * CSS image background menu item tokens:
 *   itemBackgroundImage: "url(/backgrounds/menu-tile.webp)"
 *   presentation: { kind: "styled", titleFa: "...", titleEn: "..." }
 */
