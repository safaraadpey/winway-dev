import type { ThemeId } from "@/lib/theme/types";

export type ThemeAssetCategory = "backgrounds" | "menu" | "icons" | "logo" | "assets";

export function themeAssetPath(
  themeId: ThemeId,
  category: ThemeAssetCategory,
  filename: string
): string {
  return `/themes/${themeId}/${category}/${filename}`;
}

export function themeLayoutBgImage(themeId: ThemeId): string {
  if (themeId === "light") return "none";
  return `url(${themeAssetPath(themeId, "backgrounds", "layout_BG.webp")})`;
}

/** Header frame art per theme (`public/themes/{id}/assets/headerframe.png`). */
export function themeHeaderFrameImage(themeId: ThemeId): string {
  return `url(${themeAssetPath(themeId, "assets", "headerframe.png")})`;
}

/** Ding balance capsule background (`public/themes/{id}/assets/ding_BG.png`). */
export function themeDingBalanceBgImage(themeId: ThemeId): string {
  return `url(${themeAssetPath(themeId, "assets", "ding_BG.png")})`;
}

/** Toman balance capsule background (`public/themes/{id}/assets/toman_BG.png`). */
export function themeTomanBalanceBgImage(themeId: ThemeId): string {
  return `url(${themeAssetPath(themeId, "assets", "toman_BG.png")})`;
}

/** Active game chip background (`public/themes/{id}/assets/gamebadge.png`). */
export function themeActiveGameChipBgImage(themeId: ThemeId): string {
  return `url(${themeAssetPath(themeId, "assets", "gamebadge.png")})`;
}
