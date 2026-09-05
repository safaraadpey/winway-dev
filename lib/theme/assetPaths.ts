import type { ThemeId } from "@/lib/theme/types";

export type ThemeAssetCategory = "backgrounds" | "menu" | "icons" | "logo" | "assets";

/** `${themeId}/${category}/${filename.webp}` for files that exist on disk. */
const THEME_WEBP_FILES = new Set<string>([
  "dark/assets/ActiveCardsBG.webp",
  "dark/assets/BG002.webp",
  "dark/assets/BuyCardBotton.webp",
  "dark/assets/ding_BG.webp",
  "dark/assets/gamebadge.webp",
  "dark/assets/headerframe.webp",
  "dark/assets/login_BG.webp",
  "dark/assets/TicktBuy_BG.webp",
  "dark/logo/ding_money.webp",
  "dark/logo/ingamelogo.webp",
  "dark/logo/logo.webp",
  "dark/logo/playerheaderlogo.webp",
  "dark/menu/menu-game-room.webp",
  "dark/menu/menu-leaderboard.webp",
  "dark/menu/menu-logout.webp",
  "dark/menu/menu-my-profile.webp",
  "dark/menu/menu-reports.webp",
  "dark/menu/settings.webp",
  "dark/menu/support.webp",
  "dark/menu/tournament.webp",
  "light/assets/ActiveCardsBG.webp",
  "light/assets/BG002.webp",
  "light/assets/BuyCardBotton.webp",
  "light/assets/ding_BG.webp",
  "light/assets/gamebadge.webp",
  "light/assets/headerframe.webp",
  "light/assets/login_BG.webp",
  "light/logo/ding_money.webp",
  "light/logo/ingamelogo.webp",
  "light/logo/logo.webp",
  "light/logo/playerheaderlogo.webp",
  "light/menu/menu-game-room.webp",
  "light/menu/menu-leaderboard.webp",
  "light/menu/menu-logout.webp",
  "light/menu/menu-my-profile.webp",
  "light/menu/menu-reports.webp",
  "light/menu/settings.webp",
  "light/menu/support.webp",
  "light/menu/tournament.webp",
]);

/** Use sibling `.webp` when that file exists for this theme; otherwise keep the original. */
export function themeImageFilename(
  themeId: ThemeId,
  category: ThemeAssetCategory,
  filename: string
): string {
  const webp = filename.replace(/\.(png|jpe?g)$/i, ".webp");
  if (webp !== filename && THEME_WEBP_FILES.has(`${themeId}/${category}/${webp}`)) {
    return webp;
  }
  return filename;
}

export function themeAssetPath(
  themeId: ThemeId,
  category: ThemeAssetCategory,
  filename: string
): string {
  return `/themes/${themeId}/${category}/${themeImageFilename(themeId, category, filename)}`;
}

export function themeLayoutBgImage(themeId: ThemeId): string {
  if (themeId === "light") return "none";
  return `url(${themeAssetPath(themeId, "backgrounds", "layout_BG.webp")})`;
}

/** Header frame art per theme (`public/themes/{id}/assets/headerframe.*`). */
export function themeHeaderFrameImage(themeId: ThemeId): string {
  return `url(${themeAssetPath(themeId, "assets", "headerframe.png")})`;
}

/** Ding balance capsule background (`public/themes/{id}/assets/ding_BG.*`). */
export function themeDingBalanceBgImage(themeId: ThemeId): string {
  return `url(${themeAssetPath(themeId, "assets", "ding_BG.png")})`;
}

/** Toman balance capsule background (`public/themes/{id}/assets/toman_BG.png`). */
export function themeTomanBalanceBgImage(themeId: ThemeId): string {
  return `url(${themeAssetPath(themeId, "assets", "toman_BG.png")})`;
}

/** Active game chip background (`public/themes/{id}/assets/gamebadge.*`). */
export function themeActiveGameChipBgImage(themeId: ThemeId): string {
  return `url(${themeAssetPath(themeId, "assets", "gamebadge.png")})`;
}
