import { themeAssetPath } from "@/lib/theme/assetPaths";
import type { MenuImageKey, ThemeId } from "@/lib/theme/types";

export const MENU_IMAGE_FILES: Record<MenuImageKey, string> = {
  gameRoom: "menu-game-room.png",
  tournaments: "tournament.png",
  leaderboard: "menu-leaderboard.png",
  myProfile: "menu-my-profile.png",
  settings: "settings.png",
  reports: "menu-reports.png",
  support: "support.png",
  logout: "menu-logout.png",
};

export function getMenuImagePath(themeId: ThemeId, key: MenuImageKey): string {
  return themeAssetPath(themeId, "menu", MENU_IMAGE_FILES[key]);
}
